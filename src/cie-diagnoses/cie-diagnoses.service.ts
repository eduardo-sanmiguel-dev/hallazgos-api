import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';

import { CreateCieDiagnosisDto, UpdateCieDiagnosisDto } from './dto/index.js';
import { CieDiagnosis } from './entities/cie-diagnosis.entity.js';

@Injectable()
export class CieDiagnosesService {
  constructor(
    @InjectRepository(CieDiagnosis)
    private readonly cieDiagnosisRepository: Repository<CieDiagnosis>,
  ) {}

  create(createCieDiagnosisDto: CreateCieDiagnosisDto) {
    return this.cieDiagnosisRepository.save(createCieDiagnosisDto);
  }

  findAll() {
    return this.cieDiagnosisRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} cieDiagnosis`;
  }

  update(id: number, updateCieDiagnosisDto: UpdateCieDiagnosisDto) {
    return { id, updateCieDiagnosisDto };
  }

  remove(id: number) {
    return `This action removes a #${id} cieDiagnosis`;
  }
}
