import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';

import { CreateNatureOfEventDto, UpdateNatureOfEventDto } from './dto/index.js';
import { NatureOfEvent } from './entities/nature-of-event.entity.js';

@Injectable()
export class NatureOfEventsService {
  constructor(
    @InjectRepository(NatureOfEvent)
    private readonly natureOfEventRepository: Repository<NatureOfEvent>,
  ) {}

  create(createNatureOfEventDto: CreateNatureOfEventDto) {
    return this.natureOfEventRepository.save(createNatureOfEventDto);
  }

  findAll() {
    return this.natureOfEventRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} natureOfEvent`;
  }

  update(id: number, updateNatureOfEventDto: UpdateNatureOfEventDto) {
    return { id, updateNatureOfEventDto };
  }

  remove(id: number) {
    return `This action removes a #${id} natureOfEvent`;
  }
}
