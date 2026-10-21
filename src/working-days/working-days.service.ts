import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';

import { CreateWorkingDayDto, UpdateWorkingDayDto } from './dto/index.js';
import { WorkingDay } from './entities/working-day.entity.js';

@Injectable()
export class WorkingDaysService {
  constructor(
    @InjectRepository(WorkingDay)
    private readonly workingDayRepository: Repository<WorkingDay>,
  ) {}

  create(createWorkingDayDto: CreateWorkingDayDto) {
    return this.workingDayRepository.save(createWorkingDayDto);
  }

  findAll() {
    return this.workingDayRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} workingDay`;
  }

  update(id: number, updateWorkingDayDto: UpdateWorkingDayDto) {
    return { id, updateWorkingDayDto };
  }

  remove(id: number) {
    return `This action removes a #${id} workingDay`;
  }
}
