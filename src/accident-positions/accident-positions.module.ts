import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { AccidentPositionsController } from './accident-positions.controller.js';
import { AccidentPositionsService } from './accident-positions.service.js';
import { AccidentPosition } from './entities/accident-position.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AccidentPosition])],
  controllers: [AccidentPositionsController],
  providers: [AccidentPositionsService],
  exports: [TypeOrmModule, AccidentPositionsService],
})
export class AccidentPositionsModule {}
