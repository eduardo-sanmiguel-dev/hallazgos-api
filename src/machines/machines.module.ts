import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { MachinesController } from './machines.controller.js';
import { MachinesService } from './machines.service.js';
import { Machine } from './entities/machine.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Machine])],
  controllers: [MachinesController],
  providers: [MachinesService],
  exports: [TypeOrmModule, MachinesService],
})
export class MachinesModule {}
