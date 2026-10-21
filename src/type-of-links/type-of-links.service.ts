import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';

import { CreateTypeOfLinkDto, UpdateTypeOfLinkDto } from './dto/index.js';
import { TypeOfLink } from './entities/type-of-link.entity.js';

@Injectable()
export class TypeOfLinksService {
  constructor(
    @InjectRepository(TypeOfLink)
    private readonly typeOfLinkRepository: Repository<TypeOfLink>,
  ) {}

  create(createTypeOfLinkDto: CreateTypeOfLinkDto) {
    return this.typeOfLinkRepository.save(createTypeOfLinkDto);
  }

  findAll() {
    return this.typeOfLinkRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} typeOfLink`;
  }

  update(id: number, updateTypeOfLinkDto: UpdateTypeOfLinkDto) {
    return { id, updateTypeOfLinkDto };
  }

  remove(id: number) {
    return `This action removes a #${id} typeOfLink`;
  }
}
