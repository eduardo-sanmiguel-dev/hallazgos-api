import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { RiskFactorsController } from './risk-factors.controller.js';
import { RiskFactorsService } from './risk-factors.service.js';
import { RiskFactor } from './entities/risk-factor.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([RiskFactor])],
  controllers: [RiskFactorsController],
  providers: [RiskFactorsService],
  exports: [TypeOrmModule, RiskFactorsService],
})
export class RiskFactorsModule {}
