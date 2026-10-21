import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { TypeOfInjuriesController } from './type-of-injuries.controller.js';
import { TypeOfInjuriesService } from './type-of-injuries.service.js';
import { TypeOfInjury } from './entities/type-of-injury.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([TypeOfInjury])],
  controllers: [TypeOfInjuriesController],
  providers: [TypeOfInjuriesService],
  exports: [TypeOrmModule, TypeOfInjuriesService],
})
export class TypeOfInjuriesModule {}
