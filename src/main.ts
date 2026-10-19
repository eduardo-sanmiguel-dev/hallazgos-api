import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import cookieParser = require('cookie-parser');
import helmet from 'helmet';

//import { GlobalExceptionFilter } from '@shared/filters';
//import { ClusterService } from 'cluster.service';
import { AppModule } from './app.module';
import { QueryFailedExceptionFilter } from './shared/filters/query-failed-exception.filter';
//import { ENV_DEVELOPMENT } from '@shared/constants';

async function bootstrap() {
  const logger = new Logger('APP-SERVICE');

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

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

  // Cierra conexiones (BD, cron) ordenadamente ante SIGTERM/SIGINT.
  app.enableShutdownHooks();

  app.setGlobalPrefix('/api/v1');

  //app.useGlobalFilters(new GlobalExceptionFilter());
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

bootstrap();

/* if (process.env.NODE_ENV === ENV_DEVELOPMENT) {
  bootstrap();
} else {
  ClusterService.clusterize(bootstrap);
} */
