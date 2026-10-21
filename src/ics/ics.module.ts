import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { RulesOfLife } from '../rules-of-life/entities/index.js';
import { IcsController } from './ics.controller.js';
import { Ics } from './entities/ics.entity.js';
import { IcsService } from './ics.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Ics, RulesOfLife])],
  controllers: [IcsController],
  providers: [IcsService],
  exports: [TypeOrmModule, IcsService],
})
export class IcsModule {}
