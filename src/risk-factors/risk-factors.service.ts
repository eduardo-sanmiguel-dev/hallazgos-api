import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';

import { CreateRiskFactorDto, UpdateRiskFactorDto } from './dto/index.js';
import { RiskFactor } from './entities/risk-factor.entity.js';

@Injectable()
export class RiskFactorsService {
  constructor(
    @InjectRepository(RiskFactor)
    private readonly riskFactorRepository: Repository<RiskFactor>,
  ) {}

  create(createRiskFactorDto: CreateRiskFactorDto) {
    return this.riskFactorRepository.save(createRiskFactorDto);
  }

  findAll() {
    return this.riskFactorRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} riskFactor`;
  }

  update(id: number, updateRiskFactorDto: UpdateRiskFactorDto) {
    return { id, updateRiskFactorDto };
  }

  remove(id: number) {
    return `This action removes a #${id} riskFactor`;
  }
}
