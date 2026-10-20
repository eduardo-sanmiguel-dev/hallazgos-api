import {
  INestApplication,
  Provider,
  Type,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request, { Test as SupertestTest } from 'supertest';

import { QueryFailedExceptionFilter } from '@shared/filters/query-failed-exception.filter';
import { RequestContextService } from '@shared/services/request-context.service';
import { User } from 'users/entities/user.entity';

interface HttpTestAppOptions {
  controllers: Type<unknown>[];
  /** Normalmente mockProvider(Servicio). */
  providers?: Provider[];
  /** Usuario en sesión (lo pondría el middleware JWT); null = sin sesión. */
  user?: User | null;
}

/**
 * App HTTP mínima para probar controladores con supertest: mismos pipes y
 * filtros globales que main.ts y el contexto de la petición con el usuario en
 * sesión. Los servicios se simulan; lo que se prueba es el contrato HTTP
 * (rutas, validación de DTOs y parámetros, códigos de respuesta).
 */
export const createHttpTestApp = async ({
  controllers,
  providers = [],
  user = null,
}: HttpTestAppOptions) => {
  const moduleRef = await Test.createTestingModule({
    controllers,
    providers: [RequestContextService, ...providers],
  }).compile();

  const session = { user };
  const app: INestApplication = moduleRef.createNestApplication();

  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (session.user) req.user = session.user;
    RequestContextService.run(req, next);
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new QueryFailedExceptionFilter());
  // Escucha una sola vez: con un servidor sin escuchar, supertest hace
  // listen/close en cada petición y peticiones seguidas pueden cortarse
  // (ECONNRESET intermitente en descargas lentas).
  await app.listen(0, '127.0.0.1');

  return {
    app,
    http: () => request(app.getHttpServer()),
    /** Proveedor resuelto (p. ej. el servicio simulado). */
    get: <P>(token: Type<P>) => moduleRef.get(token) as jest.Mocked<P>,
    /** Cambia el usuario en sesión para las siguientes peticiones. */
    setUser: (next: User | null) => {
      session.user = next;
    },
    close: () => app.close(),
  };
};

export type HttpTestApp = Awaited<ReturnType<typeof createHttpTestApp>>;

/**
 * Parser de supertest para respuestas binarias (archivos): junta el cuerpo
 * en un Buffer. Uso: .buffer(true).parse(binaryParser)
 */
export const binaryParser = ((
  res: NodeJS.ReadableStream,
  callback: (err: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}) as unknown as Parameters<SupertestTest['parse']>[0];
