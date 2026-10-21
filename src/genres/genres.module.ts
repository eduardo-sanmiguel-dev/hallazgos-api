import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { GenresController } from './genres.controller.js';
import { GenresService } from './genres.service.js';
import { Genre } from './entities/genre.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Genre])],
  controllers: [GenresController],
  providers: [GenresService],
  exports: [TypeOrmModule, GenresService],
})
export class GenresModule {}
