import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

import { ILike, Repository } from 'typeorm';
import type { Request } from 'express';

import {
  CreateGembaWalkZoneDto,
  QueryGembaWalkZoneDto,
  UpdateGembaWalkZoneDto,
} from './dto';
import { GembaWalkZone } from './entities/gemba-walk-zone.entity';
import { User } from 'users/entities/user.entity';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';

@Injectable()
export class GembaWalkZonesService {
  private readonly relations = ['createdBy', 'updatedBy', 'manufacturingPlant'];

  constructor(
    @InjectRepository(GembaWalkZone)
    private readonly gembaWalkZoneRepository: Repository<GembaWalkZone>,
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
    @Inject(REQUEST)
    private readonly request: Request,
  ) {}

  private async validateUniqueActive(
    nameZone: string,
    nameLocation: string,
    manufacturingPlantId: number,
    excludeId?: number,
  ) {
    const qb = this.gembaWalkZoneRepository
      .createQueryBuilder('gembaWalkZone')
      .where('LOWER(gembaWalkZone.nameZone) = LOWER(:nameZone)', { nameZone })
      .andWhere('LOWER(gembaWalkZone.nameLocation) = LOWER(:nameLocation)', {
        nameLocation,
      })
      .andWhere('gembaWalkZone.manufacturingPlantId = :manufacturingPlantId', {
        manufacturingPlantId,
      })
      .andWhere('gembaWalkZone.isActive = :isActive', { isActive: true });

    if (excludeId) {
      qb.andWhere('gembaWalkZone.id <> :excludeId', { excludeId });
    }

    const existing = await qb.getOne();

    if (existing) {
      throw new BadRequestException(
        'Ya existe una zona activa con ese nombre y ubicación en la planta seleccionada',
      );
    }
  }

  async create(
    createGembaWalkZoneDto: CreateGembaWalkZoneDto,
  ): Promise<GembaWalkZone> {
    const { id: createdBy } = this.request['user'] as User;
    const { manufacturingPlantId } = createGembaWalkZoneDto;
    const nameZone = createGembaWalkZoneDto.nameZone.trim();
    const nameLocation = createGembaWalkZoneDto.nameLocation.trim();

    await this.manufacturingPlantsService.findOne(manufacturingPlantId);

    await this.validateUniqueActive(
      nameZone,
      nameLocation,
      manufacturingPlantId,
    );

    const gembaWalkZone = this.gembaWalkZoneRepository.create({
      nameZone,
      nameLocation,
      manufacturingPlant: { id: manufacturingPlantId },
      createdBy: { id: createdBy } as User,
      createdAt: new Date(),
    });

    const gembaWalkZoneSaved =
      await this.gembaWalkZoneRepository.save(gembaWalkZone);

    return this.findOne(gembaWalkZoneSaved.id);
  }

  async findAll(
    queryGembaWalkZoneDto: QueryGembaWalkZoneDto,
  ): Promise<GembaWalkZone[]> {
    const { nameZone, nameLocation, manufacturingPlantId } =
      queryGembaWalkZoneDto;

    return this.gembaWalkZoneRepository.find({
      where: {
        isActive: true,
        ...(nameZone && { nameZone: ILike(`%${nameZone}%`) }),
        ...(nameLocation && { nameLocation: ILike(`%${nameLocation}%`) }),
        manufacturingPlant: {
          isActive: true,
          ...(manufacturingPlantId && { id: manufacturingPlantId }),
        },
      },
      relations: this.relations,
      order: {
        id: 'DESC',
      },
    });
  }

  async findOne(id: number, isActive = true): Promise<GembaWalkZone> {
    const gembaWalkZone = await this.gembaWalkZoneRepository.findOne({
      where: { id },
      relations: this.relations,
    });

    if (!gembaWalkZone) {
      throw new NotFoundException(`Zona con ID ${id} no encontrada`);
    }

    if (isActive && !gembaWalkZone.isActive) {
      throw new BadRequestException(`La zona con ID ${id} esta inactiva`);
    }

    return gembaWalkZone;
  }

  async update(
    id: number,
    updateGembaWalkZoneDto: UpdateGembaWalkZoneDto,
  ): Promise<GembaWalkZone> {
    const { id: updatedBy } = this.request['user'] as User;
    const gembaWalkZoneCurrent = await this.findOne(id);

    const manufacturingPlantId =
      updateGembaWalkZoneDto.manufacturingPlantId ||
      gembaWalkZoneCurrent.manufacturingPlant.id;
    const nameZone =
      updateGembaWalkZoneDto.nameZone?.trim() || gembaWalkZoneCurrent.nameZone;
    const nameLocation =
      updateGembaWalkZoneDto.nameLocation?.trim() ||
      gembaWalkZoneCurrent.nameLocation;

    await this.manufacturingPlantsService.findOne(manufacturingPlantId);

    await this.validateUniqueActive(
      nameZone,
      nameLocation,
      manufacturingPlantId,
      id,
    );

    const gembaWalkZone = await this.gembaWalkZoneRepository.preload({
      id,
      nameZone,
      nameLocation,
      manufacturingPlant: { id: manufacturingPlantId },
      updatedBy: { id: updatedBy } as User,
      updatedAt: new Date(),
    });

    const gembaWalkZoneSaved =
      await this.gembaWalkZoneRepository.save(gembaWalkZone);

    return this.findOne(gembaWalkZoneSaved.id);
  }

  async remove(id: number): Promise<GembaWalkZone> {
    const { id: updatedBy } = this.request['user'] as User;
    const gembaWalkZone = await this.findOne(id);

    gembaWalkZone.isActive = false;
    gembaWalkZone.updatedBy = { id: updatedBy } as User;
    gembaWalkZone.updatedAt = new Date();

    return this.gembaWalkZoneRepository.save(gembaWalkZone);
  }
}
