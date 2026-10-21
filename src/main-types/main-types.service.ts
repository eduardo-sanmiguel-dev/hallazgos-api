import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type FindManyOptions, ILike, Repository } from 'typeorm';
import { findPaginated } from '../shared/utils/index.js';

import {
  CreateMainTypeDto,
  QueryMainTypeDto,
  UpdateMainTypeDto,
} from './dto/index.js';
import { MainType } from './entities/main-type.entity.js';

@Injectable()
export class MainTypesService {
  constructor(
    @InjectRepository(MainType)
    private readonly mainTypeRepository: Repository<MainType>,
  ) {}

  async create(createMainTypeDto: CreateMainTypeDto): Promise<MainType> {
    const mainType = await this.mainTypeRepository.create(createMainTypeDto);

    return this.mainTypeRepository.save(mainType);
  }

  findAll(queryMainTypeDto: QueryMainTypeDto) {
    const { page, limit } = queryMainTypeDto;
    const { name } = queryMainTypeDto;

    const options: FindManyOptions<MainType> = {
      where: {
        isActive: true,
        ...(name && { name: ILike(`%${name}%`) }),
      },
      relations: ['secondaryTypes'],
      order: {
        id: 'DESC',
      },
    };

    return page && limit
      ? findPaginated(this.mainTypeRepository, options, page, limit)
      : this.mainTypeRepository.find(options);
  }

  async findOne(id: number, isActive = true): Promise<MainType> {
    const mainType = await this.mainTypeRepository.findOne({
      where: {
        id,
        ...(isActive && { isActive }),
      },
      relations: ['secondaryTypes'],
    });

    if (!mainType) {
      throw new NotFoundException(`Criterio con ID ${id} no encontrado`);
    }

    return mainType;
  }

  async update(
    id: number,
    updateMainTypeDto: UpdateMainTypeDto,
  ): Promise<MainType> {
    await this.findOne(id);

    const manufacturingPlant = await this.mainTypeRepository.preload({
      id,
      ...updateMainTypeDto,
    });

    return this.mainTypeRepository.save(manufacturingPlant);
  }

  async remove(id: number): Promise<MainType> {
    await this.findOne(id);

    await this.mainTypeRepository.update(id, {
      isActive: false,
    });

    return this.mainTypeRepository.findOne({
      where: {
        id,
        isActive: false,
      },
    });
  }
}
