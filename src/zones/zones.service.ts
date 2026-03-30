import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ILike, In, Repository } from 'typeorm';

import { Zone } from 'zones/entities/zone.entity';
import { CreateZoneDto, QueryZoneDto, UpdateZoneDto } from './dto';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';

@Injectable()
export class ZonesService {
  constructor(
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
  ) {}

  async create(createZoneDto: CreateZoneDto): Promise<Zone> {
    const manufacturingPlant = await this.manufacturingPlantsService.findOne(
      createZoneDto.manufacturingPlantId,
    );

    const zone = await this.zoneRepository.create({
      ...createZoneDto,
      manufacturingPlant,
    });

    return this.zoneRepository.save(zone);
  }

  async findAll(queryZoneDto: QueryZoneDto): Promise<Zone[]> {
    const { name, manufacturingPlantId, manufacturingPlantNames, withArea } =
      queryZoneDto;

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
        ...(withArea && { area: { isActive: true } }),
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
      relations: ['manufacturingPlant'],
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
      relations: ['manufacturingPlant'],
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
    await this.findOne(id);

    const manufacturingPlant = await this.manufacturingPlantsService.findOne(
      updateZoneDto.manufacturingPlantId,
    );

    const zone = await this.zoneRepository.preload({
      id,
      ...updateZoneDto,
      manufacturingPlant,
    });

    return this.zoneRepository.save(zone);
  }

  async remove(id: number): Promise<Zone> {
    await this.findOne(id);

    await this.zoneRepository.update(id, {
      isActive: false,
    });

    return this.zoneRepository.findOne({
      where: {
        id,
        isActive: false,
      },
    });
  }
}
