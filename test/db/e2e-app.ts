/**
 * App completa (AppModule) contra la base de pruebas, configurada como en
 * main.ts: prefijo /api/v1, cookies, ValidationPipe y filtro de errores.
 * Lo único simulado es el envío de correos.
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { registerEvidenceImageAccess } from '../../src/evidences/evidence-image-access.middleware.js';
import { httpCacheHeaders } from '../../src/shared/middlewares/http-cache.middleware.js';
import { timingAllowOrigin } from '../../src/shared/middlewares/timing-allow-origin.middleware.js';
import { corsOptions } from '../../src/config/cors.config.js';
import { AppModule } from '../../src/app.module.js';
import { MailService } from '../../src/mail/mail.service.js';
import {
  CacheService,
  type CacheClient,
} from '../../src/shared/cache/cache.service.js';
import { MailerService } from '@nestjs-modules/mailer';
import { CreateMailOutbox1793900000000 } from '../../src/migrations/1793900000000-create-mail-outbox.js';
import { createValidationPipe } from '../../src/shared/errors/validation-errors.js';
import { ApiExceptionFilter } from '../../src/shared/filters/api-exception.filter.js';
import { originOf } from '../../src/shared/middlewares/origin.middleware.js';
import { seedBaseData, TEST_PASSWORD } from './fixtures.js';
import { recreateTestSchema, createTestDataSource } from './test-database.js';

export const API = '/api/v1';
/** Origen del UI: el que manda el navegador y acepta OriginMiddleware. */
export const UI_ORIGIN = () =>
  originOf(process.env.FRONTEND_URL || 'http://localhost:3000');

export const createE2eApp = async (
  options: {
    persistentMail?: boolean;
    /** Redis del caché (p. ej. en memoria); sin él, no hay caché. */
    cacheClient?: CacheClient;
  } = {},
) => {
  await recreateTestSchema();
  if (options.persistentMail) {
    const db = createTestDataSource();
    await db.initialize();
    const runner = db.createQueryRunner();
    await new CreateMailOutbox1793900000000().up(runner);
    await runner.release();
    await db.destroy();
  }

  const mail = {
    withOutbox: jest.fn(async (_manager, work) => work()),
    sendCreate: jest.fn().mockResolvedValue(undefined),
    sendInProgress: jest.fn().mockResolvedValue(undefined),
    sendSolution: jest.fn().mockResolvedValue(undefined),
    sendCancel: jest.fn().mockResolvedValue(undefined),
    sendReassign: jest.fn().mockResolvedValue(undefined),
    sendForgotPassword: jest.fn().mockResolvedValue(undefined),
  };

  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.persistentMail)
    builder
      .overrideProvider(MailerService)
      .useValue({ sendMail: mail.sendCreate });
  else builder.overrideProvider(MailService).useValue(mail);
  if (options.cacheClient)
    builder
      .overrideProvider(CacheService)
      .useValue(
        new CacheService(
          { get: () => undefined } as never,
          options.cacheClient,
        ),
      );
  const moduleRef = await builder.compile();

  const app: INestApplication = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  // Igual que main.ts.
  app.enableCors(corsOptions(UI_ORIGIN()));
  app.use(timingAllowOrigin(UI_ORIGIN()));
  app.use(httpCacheHeaders);
  app.use(cookieParser());
  registerEvidenceImageAccess(app);
  app.setGlobalPrefix('/api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');

  const dataSource = moduleRef.get(DataSource);
  const base = await seedBaseData(dataSource);
  const server = app.getHttpServer();

  /** Petición desde el UI (con su Origin); con `token`, además con sesión. */
  const call = (
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    token?: string,
  ) => {
    const req = request(server)
      [method](`${API}${path}`)
      .set('Origin', UI_ORIGIN());
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  /** Inicia sesión con una cuenta de prueba y devuelve el token. */
  const login = async (email: string) => {
    const res = await call('post', '/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(201);
    return res.body.token as string;
  };

  const tokens = {
    admin: await login(base.users.admin.email),
    supervisor: await login(base.users.supervisor.email),
    general: await login(base.users.general.email),
    generalColombia: await login(base.users.generalColombia.email),
  };

  return {
    app,
    server,
    dataSource,
    base,
    mail,
    call,
    login,
    tokens,
    close: () => app.close(),
  };
};

export type E2eApp = Awaited<ReturnType<typeof createE2eApp>>;
