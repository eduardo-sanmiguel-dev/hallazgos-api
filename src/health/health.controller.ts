import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DataSource } from 'typeorm';

import { CacheService } from '../shared/cache/cache.service.js';

// Estado del servicio para monitoreo / balanceadores. Público (sin JWT) y sin
// datos sensibles: solo indica si la API, la BD y la caché responden. Sin la
// caché la API funciona (consulta la base): se informa sin responder 503, y
// el deploy lo revisa aparte.
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cache: CacheService,
  ) {}

  @Get()
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch (error) {
      this.logger.error('La base de datos no responde', error?.stack);
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      });
    }

    return {
      status: 'ok',
      database: 'up',
      cache: await this.cache.status(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
