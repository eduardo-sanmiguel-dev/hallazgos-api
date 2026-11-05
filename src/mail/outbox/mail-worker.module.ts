import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import { EnvConfiguration } from '../../config/env.config.js';
import { MailModule } from '../mail.module.js';
import { MailDeliveryService } from './mail-delivery.service.js';

/** No HTTP, no application schedulers, no migrations racing the API. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      load: [EnvConfiguration],
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres' as const,
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [
          join(import.meta.dirname, '..', '..', '**', 'entities', '*.js'),
        ],
        synchronize: false,
        migrationsRun: false,
        extra: {
          max: 5,
          connectionTimeoutMillis: 10000,
          statement_timeout: 30000,
          application_name: 'comportarte-mail-worker',
        },
      }),
    }),
    MailModule,
  ],
  providers: [MailDeliveryService],
  exports: [MailDeliveryService],
})
export class MailWorkerModule {}
