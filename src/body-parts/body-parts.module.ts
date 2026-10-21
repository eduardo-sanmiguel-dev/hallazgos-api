import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { BodyPartsController } from './body-parts.controller.js';
import { BodyPartsService } from './body-parts.service.js';
import { BodyPart } from './entities/body-part.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([BodyPart])],
  controllers: [BodyPartsController],
  providers: [BodyPartsService],
})
export class BodyPartsModule {}
