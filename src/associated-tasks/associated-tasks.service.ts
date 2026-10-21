import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { type FindOptionsWhere, Repository } from 'typeorm';

import { AssociatedTask } from './entities/associated-task.entity.js';
import {
  CreateAssociatedTaskDto,
  FiltersAssociatedTaskDto,
  UpdateAssociatedTaskDto,
} from './dto/index.js';

@Injectable()
export class AssociatedTasksService {
  constructor(
    @InjectRepository(AssociatedTask)
    private readonly associatedTaskRepository: Repository<AssociatedTask>,
  ) {}

  create(createAssociatedTaskDto: CreateAssociatedTaskDto) {
    return this.associatedTaskRepository.create(createAssociatedTaskDto);
  }

  findAll(filtersAssociatedTaskDto: FiltersAssociatedTaskDto) {
    const where: FindOptionsWhere<AssociatedTask> = { isActive: true };

    if (filtersAssociatedTaskDto.manufacturingPlantId) {
      where.manufacturingPlants = {
        id: filtersAssociatedTaskDto.manufacturingPlantId,
      };
    }

    return this.associatedTaskRepository.find({ where });
  }

  findOne(id: number) {
    return `This action returns a #${id} associatedTask`;
  }

  update(id: number, updateAssociatedTaskDto: UpdateAssociatedTaskDto) {
    return { id, updateAssociatedTaskDto };
  }

  remove(id: number) {
    return `This action removes a #${id} associatedTask`;
  }
}
