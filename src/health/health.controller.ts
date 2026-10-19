import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DataSource } from 'typeorm';

// Estado del servicio para monitoreo / balanceadores. Público (sin app key ni
// JWT) y sin datos sensibles: solo indica si la API y la BD responden.
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly dataSource: DataSource) {}

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
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
