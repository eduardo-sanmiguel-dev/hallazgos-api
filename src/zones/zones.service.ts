import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ILike, In, Repository } from 'typeorm';

import { Zone } from 'zones/entities/zone.entity';
import { CreateZoneDto, QueryZoneDto, UpdateZoneDto } from './dto';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { AreasService } from 'areas/areas.service';

@Injectable()
export class ZonesService {
  constructor(
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
    private readonly areasService: AreasService,
  ) {}

  async create(createZoneDto: CreateZoneDto): Promise<Zone> {
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
    });

    return this.zoneRepository.save(zone);
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
      relations: ['manufacturingPlant', 'area'],
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
      relations: ['manufacturingPlant', 'area'],
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

    const area = updateZoneDto.areaId
      ? await this.areasService.findOne(updateZoneDto.areaId)
      : null;

    const zone = await this.zoneRepository.preload({
      id,
      ...updateZoneDto,
      manufacturingPlant,
      area,
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
