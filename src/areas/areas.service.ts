import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestContextService } from '../shared/services/request-context.service.js';

import { type FindManyOptions, ILike, Repository } from 'typeorm';
import { findPaginated } from '../shared/utils/index.js';

import { CreateAreaDto, QueryAreaDto, UpdateAreaDto } from './dto/index.js';
import { Area } from './entities/area.entity.js';
import { ManufacturingPlantsService } from '../manufacturing-plants/manufacturing-plants.service.js';
import { User } from '../users/entities/user.entity.js';

@Injectable()
export class AreasService {
  private readonly relations = ['createdBy', 'updatedBy', 'manufacturingPlant'];

  constructor(
    @InjectRepository(Area)
    private readonly areaRepository: Repository<Area>,
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
    private readonly requestContext: RequestContextService,
  ) {}

  private async validateUniqueActiveName(
    name: string,
    manufacturingPlantId: number,
    excludeId?: number,
  ) {
    const normalizedName = name.trim();

    const qb = this.areaRepository
      .createQueryBuilder('area')
      .where('LOWER(area.name) = LOWER(:name)', { name: normalizedName })
      .andWhere('area.manufacturingPlantId = :manufacturingPlantId', {
        manufacturingPlantId,
      })
      .andWhere('area.isActive = :isActive', { isActive: true });

    if (excludeId) {
      qb.andWhere('area.id <> :excludeId', { excludeId });
    }

    const existing = await qb.getOne();

    if (existing) {
      throw new BadRequestException(
        'Ya existe un area activa con ese nombre en la planta seleccionada',
      );
    }

    const inactiveQb = this.areaRepository
      .createQueryBuilder('area')
      .where('LOWER(area.name) = LOWER(:name)', { name: normalizedName })
      .andWhere('area.manufacturingPlantId = :manufacturingPlantId', {
        manufacturingPlantId,
      })
      .andWhere('area.isActive = :isActive', { isActive: false });

    if (excludeId) {
      inactiveQb.andWhere('area.id <> :excludeId', { excludeId });
    }

    const existingInactive = await inactiveQb.getOne();

    if (existingInactive) {
      throw new BadRequestException(
        'Ya existe un area inactiva con ese nombre en la planta seleccionada. Reactivela o use otro nombre',
      );
    }
  }

  async create(createAreaDto: CreateAreaDto): Promise<Area> {
    const createdBy = this.requestContext.userId;
    const { manufacturingPlantId, coordinateX, coordinateY, zoomLevel } =
      createAreaDto;
    const name = createAreaDto.name.trim();

    // Solo espacios pasaba la validación del DTO y se guardaba vacío.
    if (!name) {
      throw new BadRequestException('El nombre del área es obligatorio');
    }

    await this.manufacturingPlantsService.findOne(manufacturingPlantId);

    await this.validateUniqueActiveName(name, manufacturingPlantId);

    const area = this.areaRepository.create({
      name,
      manufacturingPlant: { id: manufacturingPlantId },
      coordinateX,
      coordinateY,
      zoomLevel,
      createdBy: { id: createdBy } as User,
      createdAt: new Date(),
    });

    const areaSaved = await this.areaRepository.save(area);

    return this.findOne(areaSaved.id);
  }

  async findAll(queryAreaDto: QueryAreaDto) {
    const { name, manufacturingPlantId, page, limit } = queryAreaDto;

    const options: FindManyOptions<Area> = {
      where: {
        isActive: true,
        ...(name && { name: ILike(`%${name}%`) }),
        manufacturingPlant: {
          isActive: true,
          ...(manufacturingPlantId && { id: manufacturingPlantId }),
        },
      },
      relations: this.relations,
      order: {
        id: 'DESC',
      },
    };

    return page && limit
      ? findPaginated(this.areaRepository, options, page, limit)
      : this.areaRepository.find(options);
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
    const updatedBy = this.requestContext.userId;
    const areaCurrent = await this.findOne(id);

    const manufacturingPlantId =
      updateAreaDto.manufacturingPlantId || areaCurrent.manufacturingPlant.id;

    await this.manufacturingPlantsService.findOne(manufacturingPlantId);

    if (updateAreaDto.name) {
      await this.validateUniqueActiveName(
        updateAreaDto.name.trim(),
        manufacturingPlantId,
        id,
      );
    }

    const area = await this.areaRepository.preload({
      id,
      ...(updateAreaDto.name && { name: updateAreaDto.name.trim() }),
      ...(updateAreaDto.coordinateX !== undefined && {
        coordinateX: updateAreaDto.coordinateX,
      }),
      ...(updateAreaDto.coordinateY !== undefined && {
        coordinateY: updateAreaDto.coordinateY,
      }),
      ...(updateAreaDto.zoomLevel !== undefined && {
        zoomLevel: updateAreaDto.zoomLevel,
      }),
      manufacturingPlant: { id: manufacturingPlantId },
      updatedBy: { id: updatedBy } as User,
      updatedAt: new Date(),
    });

    const areaSaved = await this.areaRepository.save(area);

    return this.findOne(areaSaved.id);
  }

  async remove(id: number): Promise<Area> {
    const updatedBy = this.requestContext.userId;
    const area = await this.findOne(id);

    area.isActive = false;
    area.updatedBy = { id: updatedBy } as User;
    area.updatedAt = new Date();

    return this.areaRepository.save(area);
  }
}
