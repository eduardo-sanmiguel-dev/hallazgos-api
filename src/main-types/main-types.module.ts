import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MainTypesService } from './main-types.service.js';
import { MainTypesController } from './main-types.controller.js';
import { MainType } from './entities/main-type.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([MainType])],
  controllers: [MainTypesController],
  providers: [MainTypesService],
  exports: [TypeOrmModule, MainTypesService],
})
export class MainTypesModule {}
