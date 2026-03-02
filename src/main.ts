import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import * as cookieParser from 'cookie-parser';

//import { GlobalExceptionFilter } from '@shared/filters';
//import { ClusterService } from 'cluster.service';
import { AppModule } from './app.module';
//import { ENV_DEVELOPMENT } from '@shared/constants';

async function bootstrap() {
  const logger = new Logger('APP-SERVICE');

  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
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

  await app.listen(process.env.PORT);

  logger.debug(
    `Running on port: [${process.env.PORT}], environment: [${process.env.NODE_ENV}]`,
  );
}

bootstrap();

/* if (process.env.NODE_ENV === ENV_DEVELOPMENT) {
  bootstrap();
} else {
  ClusterService.clusterize(bootstrap);
} */
