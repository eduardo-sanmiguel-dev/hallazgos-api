import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';

import { CreateAtMechanismDto, UpdateAtMechanismDto } from './dto/index.js';
import { AtMechanism } from './entities/at-mechanism.entity.js';

@Injectable()
export class AtMechanismsService {
  constructor(
    @InjectRepository(AtMechanism)
    private readonly atMechanismRepository: Repository<AtMechanism>,
  ) {}

  create(createAtMechanismDto: CreateAtMechanismDto) {
    return this.atMechanismRepository.create(createAtMechanismDto);
  }

  findAll() {
    return this.atMechanismRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} atMechanism`;
  }

  update(id: number, updateAtMechanismDto: UpdateAtMechanismDto) {
    return { id, updateAtMechanismDto };
  }

  remove(id: number) {
    return `This action removes a #${id} atMechanism`;
  }
}
