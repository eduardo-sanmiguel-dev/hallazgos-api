import { Injectable } from '@nestjs/common';

import { CreateAtAgentDto, UpdateAtAgentDto } from './dto/index.js';
import { AtAgent } from './entities/at-agent.entity.js';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class AtAgentsService {
  constructor(
    @InjectRepository(AtAgent)
    private readonly atAgentRepository: Repository<AtAgent>,
  ) {}

  create(createAtAgentDto: CreateAtAgentDto) {
    return this.atAgentRepository.save(createAtAgentDto);
  }

  findAll() {
    return this.atAgentRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} atAgent`;
  }

  update(id: number, updateAtAgentDto: UpdateAtAgentDto) {
    return { id, updateAtAgentDto };
  }

  remove(id: number) {
    return `This action removes a #${id} atAgent`;
  }
}
