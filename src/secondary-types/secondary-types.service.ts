import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { FindManyOptions, ILike, Repository } from 'typeorm';
import { findPaginated } from 'shared/utils';

import {
  CreateSecondaryTypeDto,
  QuerySecondaryTypeDto,
  UpdateSecondaryTypeDto,
} from './dto';
import { SecondaryType } from './entities/secondary-type.entity';
import { MainTypesService } from 'main-types/main-types.service';

@Injectable()
export class SecondaryTypesService {
  constructor(
    @InjectRepository(SecondaryType)
    private readonly secondaryTypeRepository: Repository<SecondaryType>,
    private readonly mainTypesService: MainTypesService,
  ) {}

  async create(
    createSecondaryTypeDto: CreateSecondaryTypeDto,
  ): Promise<SecondaryType> {
    const mainType = await this.mainTypesService.findOne(
      createSecondaryTypeDto.mainTypeId,
    );

    const SecondaryType = await this.secondaryTypeRepository.create({
      ...createSecondaryTypeDto,
      mainType,
    });

    return this.secondaryTypeRepository.save(SecondaryType);
  }

  findAll(querySecondaryTypeDto: QuerySecondaryTypeDto) {
    const { page, limit } = querySecondaryTypeDto;
    const { name, mainTypeId } = querySecondaryTypeDto;

    const options: FindManyOptions<SecondaryType> = {
      where: {
        isActive: true,
        ...(name && { name: ILike(`%${name}%`) }),
        ...(mainTypeId && { mainType: { id: mainTypeId } }),
      },
      relations: ['mainType'],
      order: {
        id: 'DESC',
      },
    };

    return page && limit
      ? findPaginated(this.secondaryTypeRepository, options, page, limit)
      : this.secondaryTypeRepository.find(options);
  }

  findAllByManufacturingPlant(id: number) {
    return this.secondaryTypeRepository.find({
      where: { mainType: { id }, isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: number, isActive = true): Promise<SecondaryType> {
    const SecondaryType = await this.secondaryTypeRepository.findOne({
      where: {
        id,
        ...(isActive && { isActive }),
      },
      relations: ['mainType'],
    });

    if (!SecondaryType) {
      throw new NotFoundException(`Tipo de critero con ID ${id} no encontrado`);
    }

    return SecondaryType;
  }

  async update(
    id: number,
    updateSecondaryTypeDto: UpdateSecondaryTypeDto,
  ): Promise<SecondaryType> {
    await this.findOne(id);

    const mainType = await this.mainTypesService.findOne(
      updateSecondaryTypeDto.mainTypeId,
    );

    const manufacturingPlant = await this.secondaryTypeRepository.preload({
      id,
      ...updateSecondaryTypeDto,
      mainType,
    });

    return this.secondaryTypeRepository.save(manufacturingPlant);
  }

  async remove(id: number): Promise<SecondaryType> {
    await this.findOne(id);

    await this.secondaryTypeRepository.update(id, {
      isActive: false,
    });

    return this.secondaryTypeRepository.findOne({
      where: {
        id,
        isActive: false,
      },
    });
  }
}
