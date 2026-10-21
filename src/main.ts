import { registerEvidenceImageAccess } from './evidences/evidence-image-access.middleware.js';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import cookieParser from 'cookie-parser';
import helmet from 'helmet';

//import { ClusterService } from 'cluster.service';
import { AppModule } from './app.module.js';
import { QueryFailedExceptionFilter } from './shared/filters/query-failed-exception.filter.js';
//import { ENV_DEVELOPMENT } from '@shared/constants';

async function bootstrap() {
  const logger = new Logger('APP-SERVICE');

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // En producción nginx (127.0.0.1) reenvía con X-Forwarded-For: se confía
  // solo en ese salto local para que req.ip sea la IP real del cliente. Sin
  // esto todas las peticiones llegan como 127.0.0.1 y el límite de intentos
  // del login se compartiría entre todos los usuarios. Un X-Forwarded-For
  // enviado desde fuera no se toma en cuenta (no viene de loopback).
  app.set('trust proxy', 'loopback');

  app.enableCors({
    origin: configService.get<string>('frontendUrl') || 'http://localhost:3000',
    credentials: true,
    // El front lee el nombre del archivo de las descargas desde este header.
    exposedHeaders: ['Content-Disposition'],
  });

  // Cabeceras de seguridad. La API solo responde JSON y archivos, así que no
  // necesita CSP (el playground de GraphQL usa scripts en línea), y el front
  // (otro origen) carga imágenes y PDFs de aquí: CORP debe ser cross-origin.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      // Los controladores reciben la instancia del DTO (con sus tipos) en
      // lugar de un objeto plano; los valores ya llegaban convertidos.
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.use(cookieParser());
  registerEvidenceImageAccess(app);

  // Cierra conexiones (BD, cron) ordenadamente ante SIGTERM/SIGINT.
  app.enableShutdownHooks();

  app.setGlobalPrefix('/api/v1');

  // Solo errores de base de datos no manejados: mensaje explícito en español
  // en lugar de "Internal server error".
  app.useGlobalFilters(new QueryFailedExceptionFilter());

  const port = configService.get<number>('port');
  const environment = configService.get<string>('environment');

  await app.listen(port, '0.0.0.0');

  logger.debug(`Running on port: [${port}], environment: [${environment}]`);

  const offsetMinutes = -new Date().getTimezoneOffset();
  const offsetSign = offsetMinutes < 0 ? '-' : '+';
  const offsetAbs = Math.abs(offsetMinutes);
  const offset = `UTC${offsetSign}${String(Math.floor(offsetAbs / 60)).padStart(2, '0')}:${String(offsetAbs % 60).padStart(2, '0')}`;

  logger.log(
    `Time zone: [${Intl.DateTimeFormat().resolvedOptions().timeZone}], offset: [${offset}], TZ env: [${process.env.TZ || '(not set)'}]`,
  );
}

// Red de seguridad: una promesa rechazada que nadie maneja (p. ej. un envío
// en segundo plano) se registra en lugar de terminar el proceso, que es lo
// que Node hace por defecto y cortaría todas las peticiones en curso.
process.on('unhandledRejection', (reason) => {
  new Logger('UnhandledRejection').error(
    (reason as Error)?.message ?? String(reason),
    (reason as Error)?.stack,
  );
});

// Si el arranque falla (p. ej. sin base de datos) sí se termina, para que
// pm2 lo reintente: con el manejador de arriba el proceso quedaría vivo sin
// escuchar.
bootstrap().catch((error) => {
  new Logger('APP-SERVICE').error(
    `No se pudo iniciar la API: ${error?.message ?? error}`,
    error?.stack,
  );
  process.exit(1);
});

/* if (process.env.NODE_ENV === ENV_DEVELOPMENT) {
  bootstrap();
} else {
  ClusterService.clusterize(bootstrap);
} */
