import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { AreaOfBehavior, RulesOfLife, StandardOfBehavior } from './entities/index.js';
import { RulesOfLifeController } from './rules-of-life.controller.js';
import { RulesOfLifeService } from './rules-of-life.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([RulesOfLife, StandardOfBehavior, AreaOfBehavior]),
  ],
  controllers: [RulesOfLifeController],
  providers: [RulesOfLifeService],
  exports: [TypeOrmModule, RulesOfLifeService],
})
export class RulesOfLifeModule {}
