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
  };

  beforeAll(async () => {
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

    app = moduleRef.createNestApplication();
    // Misma configuración de validación que main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
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
});
