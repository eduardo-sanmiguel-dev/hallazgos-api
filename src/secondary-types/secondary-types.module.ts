import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SecondaryTypesService } from './secondary-types.service.js';
import { SecondaryTypesController } from './secondary-types.controller.js';
import { SecondaryType } from './entities/secondary-type.entity.js';
import { MainTypesModule } from '../main-types/main-types.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([SecondaryType]), MainTypesModule],
  controllers: [SecondaryTypesController],
  providers: [SecondaryTypesService],
  exports: [TypeOrmModule, SecondaryTypesService],
})
export class SecondaryTypesModule {}
