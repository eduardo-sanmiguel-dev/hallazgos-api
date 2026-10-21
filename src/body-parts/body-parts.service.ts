import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';

import { CreateBodyPartDto, UpdateBodyPartDto } from './dto/index.js';
import { BodyPart } from './entities/body-part.entity.js';

@Injectable()
export class BodyPartsService {
  constructor(
    @InjectRepository(BodyPart)
    private readonly bodyPartRepository: Repository<BodyPart>,
  ) {}

  create(createBodyPartDto: CreateBodyPartDto) {
    return this.bodyPartRepository.create(createBodyPartDto);
  }

  findAll() {
    return this.bodyPartRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} bodyPart`;
  }

  update(id: number, updateBodyPartDto: UpdateBodyPartDto) {
    return { id, updateBodyPartDto };
  }

  remove(id: number) {
    return `This action removes a #${id} bodyPart`;
  }
}
