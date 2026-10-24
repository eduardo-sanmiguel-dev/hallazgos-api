import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestContextService } from '../shared/services/request-context.service.js';

import { type FindManyOptions, ILike, In, Repository } from 'typeorm';
import { findPaginated } from '../shared/utils/index.js';

import { Zone } from './entities/zone.entity.js';
import { CreateZoneDto, QueryZoneDto, UpdateZoneDto } from './dto/index.js';
import { ManufacturingPlantsService } from '../manufacturing-plants/manufacturing-plants.service.js';
import { AreasService } from '../areas/areas.service.js';
import { User } from '../users/entities/user.entity.js';

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
    private readonly requestContext: RequestContextService,
  ) {}

  async create(createZoneDto: CreateZoneDto): Promise<Zone> {
    const createdBy = this.requestContext.userId;

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

  async findAll(queryZoneDto: QueryZoneDto) {
    const {
      name,
      manufacturingPlantId,
      manufacturingPlantNames,
      withArea,
      areaId,
      page,
      limit,
      view,
    } = queryZoneDto;

    const manufacturingPlantIds = [];

    if (manufacturingPlantId) {
      manufacturingPlantIds.push(manufacturingPlantId);
    } else if (manufacturingPlantNames?.length && !manufacturingPlantId) {
      // Una consulta para todos los nombres (antes una por nombre).
      manufacturingPlantIds.push(
        ...(await this.manufacturingPlantsService.findIdsByNamesOrFail(
          manufacturingPlantNames,
        )),
      );
    }

    const options: FindManyOptions<Zone> = {
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
    };

    if (view === 'options') {
      return this.zoneRepository.find({
        ...options,
        relations: ['manufacturingPlant', 'area'],
        select: {
          id: true,
          name: true,
          manufacturingPlant: { id: true, name: true },
          area: { id: true, name: true },
        },
      });
    }

    return page && limit
      ? findPaginated(this.zoneRepository, options, page, limit)
      : this.zoneRepository.find(options);
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
      throw new NotFoundException(`Zona con ID ${id} no encontrada`);
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
    const updatedBy = this.requestContext.userId;

    const current = await this.findOne(id);

    // Sin planta se conserva la actual (antes findOne(undefined) devolvía
    // cualquier planta). areaId: null quita el área; si no llega, se conserva.
    const manufacturingPlant = updateZoneDto.manufacturingPlantId
      ? await this.manufacturingPlantsService.findOne(
          updateZoneDto.manufacturingPlantId,
        )
      : current.manufacturingPlant;

    const area =
      updateZoneDto.areaId === undefined
        ? current.area
        : updateZoneDto.areaId
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
    const updatedBy = this.requestContext.userId;
    const zone = await this.findOne(id);

    zone.isActive = false;
    zone.updatedBy = { id: updatedBy } as User;
    zone.updatedAt = new Date();

    return this.zoneRepository.save(zone);
  }
}
