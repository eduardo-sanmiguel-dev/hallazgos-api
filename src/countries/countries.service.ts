import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';

import { CreateCountryDto, UpdateCountryDto } from './dto/index.js';
import { Country } from './entities/country.entity.js';

@Injectable()
export class CountriesService {
  constructor(
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
  ) {}

  create(createCountryDto: CreateCountryDto) {
    return this.countryRepository.save(createCountryDto);
  }

  findAll() {
    return `This action returns all countries`;
  }

  findOne(id: number) {
    return `This action returns a #${id} country`;
  }

  update(id: number, updateCountryDto: UpdateCountryDto) {
    return { id, updateCountryDto };
  }

  remove(id: number) {
    return `This action removes a #${id} country`;
  }
}
