import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { CountriesController } from './countries.controller.js';
import { CountriesService } from './countries.service.js';
import { Country } from './entities/country.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Country])],
  controllers: [CountriesController],
  providers: [CountriesService],
  exports: [TypeOrmModule, CountriesService],
})
export class CountriesModule {}
