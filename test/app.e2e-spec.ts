import {
  type INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { NextFunction, Request, Response } from 'express';

import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';
import { DashboardController } from '../src/dashboard/dashboard.controller.js';
import { DashboardService } from '../src/dashboard/dashboard.service.js';
import { EppsController } from '../src/epps/epps.controller.js';
import { EppsService } from '../src/epps/epps.service.js';
import { EquipmentsController } from '../src/equipments/equipments.controller.js';
import { EquipmentsService } from '../src/equipments/equipments.service.js';
import { HealthController } from '../src/health/health.controller.js';
import { SafetyDataFilesController } from '../src/safety-data-files/safety-data-files.controller.js';
import { SafetyDataFilesService } from '../src/safety-data-files/safety-data-files.service.js';
import { RequestContextService } from '../src/shared/services/request-context.service.js';
import type { User } from '../src/users/entities/user.entity.js';

// Pruebas HTTP de los controladores (supertest) con dependencias simuladas:
// no levantan la app completa ni tocan la base de datos.
describe('API (e2e)', () => {
  let app: INestApplication;

  const dashboardService = {
    findAllEvidencesByMonth: jest.fn().mockResolvedValue([]),
    findGlobalSummary: jest.fn().mockResolvedValue({ ok: true }),
  };
  // Usuario en sesión (lo pondría el middleware JWT): solo la planta 1.
  const sessionUser = {
    id: 7,
    role: 'General',
    manufacturingPlants: [{ id: 1, name: 'Tepotzotlán' }],
  } as unknown as User;
  const eppsService = {
    assertEmployeeInUserPlants: jest.fn(),
    getDownloadFileName: jest.fn(),
    findAll: jest.fn().mockResolvedValue([]),
    findPaginated: jest.fn().mockResolvedValue({ data: [], count: 0 }),
  };
  const equipmentsService = {
    findAll: jest.fn().mockResolvedValue([]),
    findAllPaginated: jest.fn().mockResolvedValue({ data: [], count: 0 }),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn().mockResolvedValue({ id: 1 }),
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
        EppsController,
        EquipmentsController,
      ],
      providers: [
        { provide: DashboardService, useValue: dashboardService },
        {
          provide: SafetyDataFilesService,
          useValue: { filePath: __dirname },
        },
        { provide: DataSource, useValue: dataSource },
        { provide: AuthService, useValue: authService },
        { provide: EppsService, useValue: eppsService },
        { provide: EquipmentsService, useValue: equipmentsService },
        RequestContextService,
      ],
    }).compile();

    const nestApp = moduleRef.createNestApplication();
    // Como en la app real: contexto de la petición con el usuario en sesión.
    nestApp.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = sessionUser;
      RequestContextService.run(req, next);
    });
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

  describe('dashboard: planta del usuario', () => {
    const summary = (query: string) =>
      request(app.getHttpServer()).get(`/dashboard/global-summary${query}`);

    beforeEach(() => dashboardService.findGlobalSummary.mockClear());

    it('con una planta del usuario llama al servicio con el id numérico', async () => {
      await summary('?manufacturingPlantId=1').expect(200);

      expect(dashboardService.findGlobalSummary).toHaveBeenCalledWith(1);
    });

    it('con una planta ajena responde 404 sin llegar al servicio', async () => {
      const response = await summary('?manufacturingPlantId=2').expect(404);

      expect(response.body.message).toBe('Planta #2 no encontrada');
      expect(dashboardService.findGlobalSummary).not.toHaveBeenCalled();
    });

    it.each([
      ['sin planta', ''],
      ['con una planta no numérica', '?manufacturingPlantId=1%20OR%201=1'],
      ['con planta 0', '?manufacturingPlantId=0'],
    ])('%s responde 400 sin llegar al servicio', async (_c, query) => {
      await summary(query).expect(400);

      expect(dashboardService.findGlobalSummary).not.toHaveBeenCalled();
    });
  });

  describe('EPP y equipos: planta del usuario', () => {
    const server = () => request(app.getHttpServer());

    beforeEach(() => {
      Object.values(eppsService).forEach((fn) => fn.mockClear());
      Object.values(equipmentsService).forEach((fn) => fn.mockClear());
    });

    describe('GET /epps (planta obligatoria)', () => {
      it('con planta propia consulta esa planta (lista y paginado)', async () => {
        await server().get('/epps?manufacturingPlantId=1').expect(200);
        await server().get('/epps?manufacturingPlantId=1&page=2').expect(200);

        expect(eppsService.findAll).toHaveBeenCalledWith(1);
        expect(eppsService.findPaginated).toHaveBeenCalledWith(
          expect.objectContaining({ manufacturingPlantId: 1, page: 2 }),
        );
      });

      it.each([
        ['lista', '/epps?manufacturingPlantId=2'],
        ['paginado', '/epps?manufacturingPlantId=2&page=1'],
      ])('%s con planta ajena responde 404', async (_c, url) => {
        await server().get(url).expect(404);

        expect(eppsService.findAll).not.toHaveBeenCalled();
        expect(eppsService.findPaginated).not.toHaveBeenCalled();
      });
    });

    describe('GET /epps/download/file/:employeeId', () => {
      it('un empleado de otra planta responde 404 sin generar archivo', async () => {
        eppsService.assertEmployeeInUserPlants.mockRejectedValueOnce(
          new NotFoundException('Empleado #8 no encontrado'),
        );

        await server().get('/epps/download/file/8').expect(404);

        expect(eppsService.assertEmployeeInUserPlants).toHaveBeenCalledWith(8);
        expect(eppsService.getDownloadFileName).not.toHaveBeenCalled();
      });

      it('un id no numérico responde 400', async () => {
        await server().get('/epps/download/file/abc').expect(400);

        expect(eppsService.assertEmployeeInUserPlants).not.toHaveBeenCalled();
      });
    });

    describe('GET /equipments (planta opcional)', () => {
      it('sin planta usa todas las del usuario', async () => {
        await server().get('/equipments').expect(200);
        await server().get('/equipments?page=1&limit=10').expect(200);

        expect(equipmentsService.findAll).toHaveBeenCalledWith(undefined, '');
        expect(equipmentsService.findAllPaginated).toHaveBeenCalledWith(
          undefined,
          '',
          '1',
          '10',
        );
      });

      it('con planta propia filtra por ella', async () => {
        await server().get('/equipments?manufacturingPlantId=1').expect(200);

        expect(equipmentsService.findAll).toHaveBeenCalledWith(1, '');
      });

      it.each([
        ['lista', '/equipments?manufacturingPlantId=2'],
        ['paginado', '/equipments?manufacturingPlantId=2&page=1&limit=10'],
      ])('%s con planta ajena responde 404', async (_c, url) => {
        await server().get(url).expect(404);

        expect(equipmentsService.findAll).not.toHaveBeenCalled();
        expect(equipmentsService.findAllPaginated).not.toHaveBeenCalled();
      });
    });

    describe('POST y PATCH /equipments', () => {
      const body = { name: 'Casco', manufacturingPlantId: 1 };

      it('crear en planta propia', async () => {
        await server().post('/equipments').send(body).expect(201);

        expect(equipmentsService.create).toHaveBeenCalledWith(body);
      });

      it('crear en planta ajena responde 404', async () => {
        await server()
          .post('/equipments')
          .send({ ...body, manufacturingPlantId: 2 })
          .expect(404);

        expect(equipmentsService.create).not.toHaveBeenCalled();
      });

      it('crear sin planta responde 400', async () => {
        await server().post('/equipments').send({ name: 'Casco' }).expect(400);

        expect(equipmentsService.create).not.toHaveBeenCalled();
      });

      it('editar moviendo el equipo a una planta ajena responde 404', async () => {
        await server()
          .patch('/equipments/5')
          .send({ manufacturingPlantId: 2 })
          .expect(404);

        expect(equipmentsService.update).not.toHaveBeenCalled();
      });

      it('editar con planta propia o sin planta llega al servicio', async () => {
        await server()
          .patch('/equipments/5')
          .send({ manufacturingPlantId: 1, price: 10 })
          .expect(200);
        await server().patch('/equipments/5').send({ price: 12 }).expect(200);

        expect(equipmentsService.update).toHaveBeenNthCalledWith(1, 5, {
          manufacturingPlantId: 1,
          price: 10,
        });
        expect(equipmentsService.update).toHaveBeenNthCalledWith(2, 5, {
          price: 12,
        });
      });
    });
  });

  describe('dashboard: parámetros interpolados en SQL', () => {
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

    // Sin límite a propósito: lo llama el proxy de Next desde el servidor
    // (misma IP para todos) y solo valida un token firmado de un solo uso.
    it('check-token-restore-password no tiene límite de intentos', async () => {
      const check = () =>
        request(restoreApp.getHttpServer())
          .post('/auth/check-token-restore-password')
          .send({ token: 'token-del-correo' });

      for (let i = 0; i < 15; i++) {
        await check().expect(201);
      }
    });
  });
});
