import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

import { ILike, In, Not, Repository } from 'typeorm';
import type { Request } from 'express';

import {
  CreateGembaWalkObserverDto,
  QueryGembaWalkObserverDto,
  UpdateGembaWalkObserverDto,
} from './dto';
import { GembaWalkObserver } from './entities/gemba-walk-observer.entity';
import { User } from 'users/entities/user.entity';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { GembaWalkZonesService } from 'gemba-walk-zones/gemba-walk-zones.service';

@Injectable()
export class GembaWalkObserversService {
  private readonly relations = [
    'createdBy',
    'updatedBy',
    'manufacturingPlant',
    'gembaWalkZone',
    'user',
  ];

  constructor(
    @InjectRepository(GembaWalkObserver)
    private readonly gembaWalkObserverRepository: Repository<GembaWalkObserver>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
    private readonly gembaWalkZonesService: GembaWalkZonesService,
    @Inject(REQUEST)
    private readonly request: Request,
  ) {}

  private async validateRelations(
    manufacturingPlantId: number,
    gembaWalkZoneId: number,
    userIds: number[],
    excludeId?: number,
  ) {
    await this.manufacturingPlantsService.findOne(manufacturingPlantId);

    const gembaWalkZone =
      await this.gembaWalkZonesService.findOne(gembaWalkZoneId);

    if (gembaWalkZone.manufacturingPlant.id !== manufacturingPlantId) {
      throw new BadRequestException(
        'La zona seleccionada no pertenece a la planta seleccionada',
      );
    }

    const users = await this.userRepository.find({
      where: { id: In(userIds), isActive: true },
      relations: ['manufacturingPlants'],
    });

    const missingIds = userIds.filter(
      (userId) => !users.some((user) => user.id === userId),
    );

    if (missingIds.length) {
      throw new NotFoundException(
        `Usuario(s) con ID ${missingIds.join(', ')} no encontrado(s)`,
      );
    }

    const usersOutsidePlant = users.filter(
      (user) =>
        !user.manufacturingPlants.some(
          (manufacturingPlant) =>
            manufacturingPlant.id === manufacturingPlantId,
        ),
    );

    if (usersOutsidePlant.length) {
      throw new BadRequestException(
        `Los siguientes usuarios no pertenecen a la planta seleccionada: ${usersOutsidePlant
          .map((user) => user.name)
          .join(', ')}`,
      );
    }

    const existing = await this.gembaWalkObserverRepository.find({
      where: {
        isActive: true,
        gembaWalkZone: { id: gembaWalkZoneId },
        user: { id: In(userIds) },
        ...(excludeId && { id: Not(excludeId) }),
      },
      relations: ['user'],
    });

    if (existing.length) {
      throw new BadRequestException(
        `Los siguientes usuarios ya son observadores activos en la zona seleccionada: ${existing
          .map((gembaWalkObserver) => gembaWalkObserver.user.name)
          .join(', ')}`,
      );
    }
  }

  async create(
    createGembaWalkObserverDto: CreateGembaWalkObserverDto,
  ): Promise<GembaWalkObserver[]> {
    const { id: createdBy } = this.request['user'] as User;
    const { manufacturingPlantId, gembaWalkZoneId, userIds } =
      createGembaWalkObserverDto;

    await this.validateRelations(
      manufacturingPlantId,
      gembaWalkZoneId,
      userIds,
    );

    const gembaWalkObservers = userIds.map((userId) =>
      this.gembaWalkObserverRepository.create({
        manufacturingPlant: { id: manufacturingPlantId },
        gembaWalkZone: { id: gembaWalkZoneId },
        user: { id: userId },
        createdBy: { id: createdBy } as User,
        createdAt: new Date(),
      }),
    );

    const gembaWalkObserversSaved =
      await this.gembaWalkObserverRepository.save(gembaWalkObservers);

    return this.gembaWalkObserverRepository.find({
      where: {
        id: In(gembaWalkObserversSaved.map(({ id }) => id)),
      },
      relations: this.relations,
      order: {
        id: 'DESC',
      },
    });
  }

  async findAll(
    queryGembaWalkObserverDto: QueryGembaWalkObserverDto,
  ): Promise<GembaWalkObserver[]> {
    const { manufacturingPlantId, gembaWalkZoneId, userName } =
      queryGembaWalkObserverDto;

    return this.gembaWalkObserverRepository.find({
      where: {
        isActive: true,
        manufacturingPlant: {
          isActive: true,
          ...(manufacturingPlantId && { id: manufacturingPlantId }),
        },
        ...(gembaWalkZoneId && { gembaWalkZone: { id: gembaWalkZoneId } }),
        ...(userName && {
          user: { name: ILike(`%${userName}%`) },
        }),
      },
      relations: this.relations,
      order: {
        id: 'DESC',
      },
    });
  }

  async findOne(id: number, isActive = true): Promise<GembaWalkObserver> {
    const gembaWalkObserver = await this.gembaWalkObserverRepository.findOne({
      where: { id },
      relations: this.relations,
    });

    if (!gembaWalkObserver) {
      throw new NotFoundException(`Observador con ID ${id} no encontrado`);
    }

    if (isActive && !gembaWalkObserver.isActive) {
      throw new BadRequestException(`El observador con ID ${id} esta inactivo`);
    }

    return gembaWalkObserver;
  }

  async update(
    id: number,
    updateGembaWalkObserverDto: UpdateGembaWalkObserverDto,
  ): Promise<GembaWalkObserver> {
    const { id: updatedBy } = this.request['user'] as User;
    const gembaWalkObserverCurrent = await this.findOne(id);

    const manufacturingPlantId =
      updateGembaWalkObserverDto.manufacturingPlantId ||
      gembaWalkObserverCurrent.manufacturingPlant.id;
    const gembaWalkZoneId =
      updateGembaWalkObserverDto.gembaWalkZoneId ||
      gembaWalkObserverCurrent.gembaWalkZone.id;
    const userId =
      updateGembaWalkObserverDto.userId || gembaWalkObserverCurrent.user?.id;

    if (!userId) {
      throw new BadRequestException('El usuario es requerido');
    }

    await this.validateRelations(
      manufacturingPlantId,
      gembaWalkZoneId,
      [userId],
      id,
    );

    const gembaWalkObserver = await this.gembaWalkObserverRepository.preload({
      id,
      manufacturingPlant: { id: manufacturingPlantId },
      gembaWalkZone: { id: gembaWalkZoneId },
      user: { id: userId },
      updatedBy: { id: updatedBy } as User,
      updatedAt: new Date(),
    });

    const gembaWalkObserverSaved =
      await this.gembaWalkObserverRepository.save(gembaWalkObserver);

    return this.findOne(gembaWalkObserverSaved.id);
  }

  async remove(id: number): Promise<GembaWalkObserver> {
    const { id: updatedBy } = this.request['user'] as User;
    const gembaWalkObserver = await this.findOne(id);

    gembaWalkObserver.isActive = false;
    gembaWalkObserver.updatedBy = { id: updatedBy } as User;
    gembaWalkObserver.updatedAt = new Date();

    return this.gembaWalkObserverRepository.save(gembaWalkObserver);
  }
}
