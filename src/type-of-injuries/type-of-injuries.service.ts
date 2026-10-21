import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';

import { CreateTypeOfInjuryDto, UpdateTypeOfInjuryDto } from './dto/index.js';
import { TypeOfInjury } from './entities/type-of-injury.entity.js';

@Injectable()
export class TypeOfInjuriesService {
  constructor(
    @InjectRepository(TypeOfInjury)
    private readonly typeOfInjuryRepository: Repository<TypeOfInjury>,
  ) {}

  create(createTypeOfInjuryDto: CreateTypeOfInjuryDto) {
    return this.typeOfInjuryRepository.save(createTypeOfInjuryDto);
  }

  findAll() {
    return this.typeOfInjuryRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} typeOfInjury`;
  }

  update(id: number, updateTypeOfInjuryDto: UpdateTypeOfInjuryDto) {
    return { id, updateTypeOfInjuryDto };
  }

  remove(id: number) {
    return `This action removes a #${id} typeOfInjury`;
  }
}
