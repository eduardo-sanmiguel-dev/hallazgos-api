import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';

import { CreateTypesOfEventDto, UpdateTypesOfEventDto } from './dto/index.js';
import { TypesOfEvent } from './entities/types-of-event.entity.js';

@Injectable()
export class TypesOfEventsService {
  constructor(
    @InjectRepository(TypesOfEvent)
    private readonly typesOfEventRepository: Repository<TypesOfEvent>,
  ) {}

  create(createTypesOfEventDto: CreateTypesOfEventDto) {
    return this.typesOfEventRepository.save(createTypesOfEventDto);
  }

  findAll() {
    return this.typesOfEventRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} typesOfEvent`;
  }

  update(id: number, updateTypesOfEventDto: UpdateTypesOfEventDto) {
    return { id, updateTypesOfEventDto };
  }

  remove(id: number) {
    return `This action removes a #${id} typesOfEvent`;
  }
}
