import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { DashboardController } from '../src/dashboard/dashboard.controller';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { HealthController } from '../src/health/health.controller';
import { SafetyDataFilesController } from '../src/safety-data-files/safety-data-files.controller';
import { SafetyDataFilesService } from '../src/safety-data-files/safety-data-files.service';

// Pruebas HTTP de los controladores (supertest) con dependencias simuladas:
// no levantan la app completa ni tocan la base de datos.
describe('API (e2e)', () => {
  let app: INestApplication;

  const dashboardService = {
    findMyEvidences: jest.fn().mockResolvedValue({ ok: true }),
    findAllEvidencesByMonth: jest.fn().mockResolvedValue([]),
  };
  const dataSource = {
    query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };
  const authService = {
    login: jest.fn().mockResolvedValue('token=abc; Path=/'),
    loginRestorePassword: jest.fn().mockResolvedValue('token=abc; Path=/'),
    checkTokenRestorePassword: jest.fn().mockResolvedValue({ message: 'ok' }),
  };

  // App con el contador de intentos en cero (el ThrottlerModule guarda los
  // intentos por instancia).
  const createApp = async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'auth', ttl: 60_000, limit: 10 }]),
      ],
      controllers: [
        DashboardController,
        SafetyDataFilesController,
        HealthController,
        AuthController,
      ],
      providers: [
        { provide: DashboardService, useValue: dashboardService },
        {
          provide: SafetyDataFilesService,
          useValue: { filePath: __dirname },
        },
        { provide: DataSource, useValue: dataSource },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    const nestApp = moduleRef.createNestApplication();
    // Misma configuración de validación que main.ts.
    nestApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await nestApp.init();
    return nestApp;
  };

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(() => app.close());

  describe('dashboard: parámetros interpolados en SQL', () => {
    it('acepta un userId numérico', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/my-evidences/12')
        .expect(200);
      expect(dashboardService.findMyEvidences).toHaveBeenCalledWith(12);
    });

    it('rechaza un userId con SQL (400, no llega al servicio)', async () => {
      dashboardService.findMyEvidences.mockClear();

      await request(app.getHttpServer())
        .get('/dashboard/my-evidences/1%20OR%201=1')
        .expect(400);
      expect(dashboardService.findMyEvidences).not.toHaveBeenCalled();
    });

    it('year es opcional y debe ser entero', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/evidences-by-month')
        .expect(200);
      expect(dashboardService.findAllEvidencesByMonth).toHaveBeenLastCalledWith(
        undefined,
      );

      await request(app.getHttpServer())
        .get('/dashboard/evidences-by-month?year=2026')
        .expect(200);
      expect(dashboardService.findAllEvidencesByMonth).toHaveBeenLastCalledWith(
        2026,
      );

      await request(app.getHttpServer())
        .get('/dashboard/evidences-by-month?year=2026)--')
        .expect(400);
    });
  });

  describe('HDS: descarga', () => {
    it('rechaza rutas fuera de la carpeta (path traversal)', async () => {
      await request(app.getHttpServer())
        .get('/safety-data-files/download')
        .query({ name: '../package.json' })
        .expect(404);
    });

    it('sirve un archivo de la carpeta por su nombre', async () => {
      await request(app.getHttpServer())
        .get('/safety-data-files/download')
        .query({ name: 'jest-e2e.json' })
        .expect(200);
    });
  });

  describe('health', () => {
    it('responde ok cuando la BD responde', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/health')
        .expect(200);
      expect(body).toMatchObject({ status: 'ok', database: 'up' });
    });

    it('responde 503 cuando la BD no responde', async () => {
      dataSource.query.mockRejectedValueOnce(new Error('down'));

      await request(app.getHttpServer()).get('/health').expect(503);
    });
  });

  describe('auth: rate limiting', () => {
    it('limita el login a 10 intentos por minuto por IP', async () => {
      const login = () =>
        request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'demo@example.com', password: 'x' });

      for (let i = 0; i < 10; i++) {
        await login().expect(201);
      }

      await login().expect(429);
    });
  });

  describe('auth: restablecer contraseña', () => {
    let restoreApp: INestApplication;
    const restore = (body: object) =>
      request(restoreApp.getHttpServer())
        .post('/auth/login-restore-password')
        .send(body);
    const validBody = {
      email: 'demo@example.com',
      password: 'Nueva-clave-2',
      token: 'token-del-correo',
    };

    beforeEach(async () => {
      restoreApp = await createApp();
      authService.loginRestorePassword.mockClear();
    });

    afterEach(() => restoreApp.close());

    it('exige el token del correo (400) y no llega al servicio', async () => {
      const { email, password } = validBody;

      const response = await restore({ email, password }).expect(400);

      expect(JSON.stringify(response.body.message)).toContain('token');
      expect(authService.loginRestorePassword).not.toHaveBeenCalled();
    });

    it('con el token pasa al servicio y pone la cookie de sesión', async () => {
      const response = await restore(validBody).expect(201);

      expect(authService.loginRestorePassword).toHaveBeenCalledWith(validBody);
      expect(response.headers['set-cookie']).toEqual(['token=abc; Path=/']);
    });

    it('limita a 10 intentos por minuto por IP', async () => {
      for (let i = 0; i < 10; i++) {
        await restore(validBody).expect(201);
      }

      await restore(validBody).expect(429);
    });

    it('check-token-restore-password también limita a 10 intentos por minuto', async () => {
      const check = () =>
        request(restoreApp.getHttpServer())
          .post('/auth/check-token-restore-password')
          .send({ token: 'token-del-correo' });

      for (let i = 0; i < 10; i++) {
        await check().expect(201);
      }

      await check().expect(429);
    });
  });
});
