/**
 * App completa (AppModule) contra la base de pruebas, configurada como en
 * main.ts: prefijo /api/v1, cookies, ValidationPipe y filtro de errores de BD.
 * Lo único simulado es el envío de correos.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser = require('cookie-parser');
import request from 'supertest';
import { DataSource } from 'typeorm';

import { registerEvidenceImageAccess } from '../../src/evidences/evidence-image-access.middleware';
import { AppModule } from '../../src/app.module';
import { MailService } from '../../src/mail/mail.service';
import { QueryFailedExceptionFilter } from '../../src/shared/filters/query-failed-exception.filter';
import { seedBaseData, TEST_PASSWORD } from './fixtures';
import { recreateTestSchema } from './test-database';

export const API = '/api/v1';
export const APP_KEY = () => process.env.APP_KEY as string;

export const createE2eApp = async () => {
  await recreateTestSchema();

  const mail = {
    sendCreate: jest.fn().mockResolvedValue(undefined),
    sendInProgress: jest.fn().mockResolvedValue(undefined),
    sendSolution: jest.fn().mockResolvedValue(undefined),
    sendCancel: jest.fn().mockResolvedValue(undefined),
    sendReassign: jest.fn().mockResolvedValue(undefined),
    sendForgotPassword: jest.fn().mockResolvedValue(undefined),
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.use(cookieParser());
  registerEvidenceImageAccess(app);
  app.setGlobalPrefix('/api/v1');
  app.useGlobalFilters(new QueryFailedExceptionFilter());
  await app.listen(0, '127.0.0.1');

  const dataSource = moduleRef.get(DataSource);
  const base = await seedBaseData(dataSource);
  const server = app.getHttpServer();

  /** Petición con app key; con `token`, además con sesión. */
  const call = (
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    token?: string,
  ) => {
    const req = request(server)
      [method](`${API}${path}`)
      .set('x-app-key', APP_KEY());
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
