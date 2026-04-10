import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

import { ILike, Repository } from 'typeorm';
import { Request } from 'express';

import { CreateAreaDto, QueryAreaDto, UpdateAreaDto } from './dto';
import { Area } from './entities/area.entity';
import { User } from 'users/entities/user.entity';

@Injectable()
export class AreasService {
  private readonly relations = ['createdBy', 'updatedBy'];

  constructor(
    @InjectRepository(Area)
    private readonly areaRepository: Repository<Area>,
    @Inject(REQUEST)
    private readonly request: Request,
  ) {}

  private async validateUniqueActiveName(name: string, excludeId?: number) {
    const normalizedName = name.trim();

    const qb = this.areaRepository
      .createQueryBuilder('area')
      .where('LOWER(area.name) = LOWER(:name)', { name: normalizedName })
      .andWhere('area.isActive = :isActive', { isActive: true });

    if (excludeId) {
      qb.andWhere('area.id <> :excludeId', { excludeId });
    }

    const existing = await qb.getOne();

    if (existing) {
      throw new BadRequestException('Ya existe un area activa con ese nombre');
    }

    const inactiveQb = this.areaRepository
      .createQueryBuilder('area')
      .where('LOWER(area.name) = LOWER(:name)', { name: normalizedName })
      .andWhere('area.isActive = :isActive', { isActive: false });

    if (excludeId) {
      inactiveQb.andWhere('area.id <> :excludeId', { excludeId });
    }

    const existingInactive = await inactiveQb.getOne();

    if (existingInactive) {
      throw new BadRequestException(
        'Ya existe un area inactiva con ese nombre. Reactivela o use otro nombre',
      );
    }
  }

  async create(createAreaDto: CreateAreaDto): Promise<Area> {
    const { id: createdBy } = this.request['user'] as User;
    const name = createAreaDto.name.trim();

    await this.validateUniqueActiveName(name);

    const area = this.areaRepository.create({
      name,
      createdBy: { id: createdBy } as User,
      createdAt: new Date(),
    });

    const areaSaved = await this.areaRepository.save(area);

    return this.findOne(areaSaved.id);
  }

  async findAll(queryAreaDto: QueryAreaDto): Promise<Area[]> {
    const { name } = queryAreaDto;

    return this.areaRepository.find({
      where: {
        isActive: true,
        ...(name && { name: ILike(`%${name}%`) }),
      },
      relations: this.relations,
      order: {
        id: 'DESC',
      },
    });
  }

  async findOne(id: number, isActive = true): Promise<Area> {
    const area = await this.areaRepository.findOne({
      where: { id },
      relations: this.relations,
    });

    if (!area) {
      throw new NotFoundException(`Area con ID ${id} no encontrado`);
    }

    if (isActive && !area.isActive) {
      throw new BadRequestException(`El area con ID ${id} esta inactiva`);
    }

    return area;
  }

  async update(id: number, updateAreaDto: UpdateAreaDto): Promise<Area> {
    const { id: updatedBy } = this.request['user'] as User;
    await this.findOne(id);

    if (updateAreaDto.name) {
      await this.validateUniqueActiveName(updateAreaDto.name.trim(), id);
    }

    const area = await this.areaRepository.preload({
      id,
      ...(updateAreaDto.name && { name: updateAreaDto.name.trim() }),
      updatedBy: { id: updatedBy } as User,
      updatedAt: new Date(),
    });

    const areaSaved = await this.areaRepository.save(area);

    return this.findOne(areaSaved.id);
  }

  async remove(id: number): Promise<Area> {
    const { id: updatedBy } = this.request['user'] as User;
    const area = await this.findOne(id);

    area.isActive = false;
    area.updatedBy = { id: updatedBy } as User;
    area.updatedAt = new Date();

    return this.areaRepository.save(area);
  }
}
