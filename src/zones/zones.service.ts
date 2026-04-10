import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';

import { ILike, In, Repository } from 'typeorm';
import { Request } from 'express';

import { Zone } from 'zones/entities/zone.entity';
import { CreateZoneDto, QueryZoneDto, UpdateZoneDto } from './dto';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { AreasService } from 'areas/areas.service';
import { User } from 'users/entities/user.entity';

@Injectable()
export class ZonesService {
  private readonly relations = [
    'createdBy',
    'updatedBy',
    'manufacturingPlant',
    'area',
  ];

  constructor(
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
    private readonly areasService: AreasService,
    @Inject(REQUEST)
    private readonly request: Request,
  ) {}

  async create(createZoneDto: CreateZoneDto): Promise<Zone> {
    const { id: createdBy } = this.request['user'] as User;

    const manufacturingPlant = await this.manufacturingPlantsService.findOne(
      createZoneDto.manufacturingPlantId,
    );

    const area = createZoneDto.areaId
      ? await this.areasService.findOne(createZoneDto.areaId)
      : null;

    const zone = await this.zoneRepository.create({
      ...createZoneDto,
      manufacturingPlant,
      area,
      createdBy: { id: createdBy } as User,
      createdAt: new Date(),
    });

    try {
      const zoneSaved = await this.zoneRepository.save(zone);
      return this.findOne(zoneSaved.id);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          'Ya existe una zona con ese nombre en la planta seleccionada',
        );
      }

      throw error;
    }
  }

  async findAll(queryZoneDto: QueryZoneDto): Promise<Zone[]> {
    const {
      name,
      manufacturingPlantId,
      manufacturingPlantNames,
      withArea,
      areaId,
    } = queryZoneDto;

    const manufacturingPlantIds = [];

    if (manufacturingPlantId) {
      manufacturingPlantIds.push(manufacturingPlantId);
    } else if (manufacturingPlantNames?.length && !manufacturingPlantId) {
      for (let i = 0, t = manufacturingPlantNames.length; i < t; i++) {
        const manufacturingPlantName = manufacturingPlantNames[i];

        const manufacturing =
          await this.manufacturingPlantsService.findOneByName(
            manufacturingPlantName,
          );

        if (manufacturing) {
          manufacturingPlantIds.push(manufacturing.id);
        }
      }
    }

    return this.zoneRepository.find({
      where: {
        isActive: true,
        ...((withArea || areaId) && {
          area: {
            isActive: true,
            ...(areaId && { id: areaId }),
          },
        }),
        ...(name && { name: ILike(`%${name}%`) }),
        ...(manufacturingPlantIds.length
          ? {
              manufacturingPlant: {
                id: In(manufacturingPlantIds),
                isActive: true,
              },
            }
          : {
              manufacturingPlant: { isActive: true },
            }),
      },
      relations: this.relations,
      order: {
        id: 'DESC',
      },
    });
  }

  async findOne(id: number, isActive = true): Promise<Zone> {
    const zone = await this.zoneRepository.findOne({
      where: {
        id,
        ...(isActive && { isActive }),
        manufacturingPlant: { isActive: true },
      },
      relations: this.relations,
    });

    if (!zone) {
      throw new NotFoundException(`Planta con ID ${id} no encontrado`);
    }

    return zone;
  }

  async findAllByManufacturingPlantNames(names: string[]): Promise<Zone[]> {
    const zones = [];

    if (!names?.length) return zones;

    for (let i = 0; i < names.length; i++) {
      const [manufacturingPlantName, ...rest] = names[i].split(' - ');
      const zone = await this.zoneRepository.findOne({
        where: {
          name: rest.join(' - '),
          isActive: true,
          manufacturingPlant: {
            name: manufacturingPlantName,
            isActive: true,
          },
        },
      });

      if (zone) {
        zones.push(zone);
      }
    }

    return zones;
  }

  async update(id: number, updateZoneDto: UpdateZoneDto): Promise<Zone> {
    const { id: updatedBy } = this.request['user'] as User;

    await this.findOne(id);

    const manufacturingPlant = await this.manufacturingPlantsService.findOne(
      updateZoneDto.manufacturingPlantId,
    );

    const area = updateZoneDto.areaId
      ? await this.areasService.findOne(updateZoneDto.areaId)
      : null;

    const zone = await this.zoneRepository.preload({
      id,
      ...updateZoneDto,
      manufacturingPlant,
      area,
      updatedBy: { id: updatedBy } as User,
      updatedAt: new Date(),
    });

    try {
      const zoneSaved = await this.zoneRepository.save(zone);
      return this.findOne(zoneSaved.id);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          'Ya existe una zona con ese nombre en la planta seleccionada',
        );
      }

      throw error;
    }
  }

  async remove(id: number): Promise<Zone> {
    const { id: updatedBy } = this.request['user'] as User;
    const zone = await this.findOne(id);

    zone.isActive = false;
    zone.updatedBy = { id: updatedBy } as User;
    zone.updatedAt = new Date();

    return this.zoneRepository.save(zone);
  }
}
