import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { AtMechanismsController } from './at-mechanisms.controller.js';
import { AtMechanismsService } from './at-mechanisms.service.js';
import { AtMechanism } from './entities/at-mechanism.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AtMechanism])],
  controllers: [AtMechanismsController],
  providers: [AtMechanismsService],
  exports: [TypeOrmModule, AtMechanismsService],
})
export class AtMechanismsModule {}
