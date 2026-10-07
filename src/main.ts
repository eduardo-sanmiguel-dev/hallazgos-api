import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import cookieParser = require('cookie-parser');

//import { GlobalExceptionFilter } from '@shared/filters';
//import { ClusterService } from 'cluster.service';
import { AppModule } from './app.module';
//import { ENV_DEVELOPMENT } from '@shared/constants';

async function bootstrap() {
  const logger = new Logger('APP-SERVICE');

  const app = await NestFactory.create(AppModule, {
    /*cors: {
      origin: process.env.WHITE_LIST_DOMAINS!.split(','),
      credentials: true,
    },*/
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
      // El front lee el nombre del archivo de las descargas desde este header.
      exposedHeaders: ['Content-Disposition'],
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.use(cookieParser());

  app.setGlobalPrefix('/api/v1');

  //app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(process.env.PORT, '0.0.0.0');

  logger.debug(
    `Running on port: [${process.env.PORT}], environment: [${process.env.NODE_ENV}]`,
  );

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
