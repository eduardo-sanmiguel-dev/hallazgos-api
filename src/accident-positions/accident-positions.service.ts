import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { type FindOptionsWhere, Repository } from 'typeorm';

import { AccidentPosition } from './entities/accident-position.entity.js';
import {
  CreateAccidentPositionDto,
  FiltersAccidentPositionDto,
  UpdateAccidentPositionDto,
} from './dto/index.js';

@Injectable()
export class AccidentPositionsService {
  constructor(
    @InjectRepository(AccidentPosition)
    private readonly accidentPositionRepository: Repository<AccidentPosition>,
  ) {}

  create(createAccidentPositionDto: CreateAccidentPositionDto) {
    return this.accidentPositionRepository.save(createAccidentPositionDto);
  }

  findAll(filtersAccidentPositionDto: FiltersAccidentPositionDto) {
    const where: FindOptionsWhere<AccidentPosition> = { isActive: true };

    if (filtersAccidentPositionDto.manufacturingPlantId) {
      where.manufacturingPlants = {
        id: filtersAccidentPositionDto.manufacturingPlantId,
      };
    }

    return this.accidentPositionRepository.find({ where });
  }

  findOne(id: number) {
    return `This action returns a #${id} accidentPosition`;
  }

  update(id: number, updateAccidentPositionDto: UpdateAccidentPositionDto) {
    return { id, updateAccidentPositionDto };
  }

  remove(id: number) {
    return `This action removes a #${id} accidentPosition`;
  }
}
