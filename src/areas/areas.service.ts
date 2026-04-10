import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ILike, Repository } from 'typeorm';

import { CreateAreaDto, QueryAreaDto, UpdateAreaDto } from './dto';
import { Area } from './entities/area.entity';

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Area)
    private readonly areaRepository: Repository<Area>,
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
    const name = createAreaDto.name.trim();

    await this.validateUniqueActiveName(name);

    const area = this.areaRepository.create({
      name,
    });

    return this.areaRepository.save(area);
  }

  async findAll(queryAreaDto: QueryAreaDto): Promise<Area[]> {
    const { name } = queryAreaDto;

    return this.areaRepository.find({
      where: {
        isActive: true,
        ...(name && { name: ILike(`%${name}%`) }),
      },
      order: {
        id: 'DESC',
      },
    });
  }

  async findOne(id: number, isActive = true): Promise<Area> {
    const area = await this.areaRepository.findOne({ where: { id } });

    if (!area) {
      throw new NotFoundException(`Area con ID ${id} no encontrado`);
    }

    if (isActive && !area.isActive) {
      throw new BadRequestException(`El area con ID ${id} esta inactiva`);
    }

    return area;
  }

  async update(id: number, updateAreaDto: UpdateAreaDto): Promise<Area> {
    await this.findOne(id);

    if (updateAreaDto.name) {
      await this.validateUniqueActiveName(updateAreaDto.name.trim(), id);
    }

    const area = await this.areaRepository.preload({
      id,
      ...(updateAreaDto.name && { name: updateAreaDto.name.trim() }),
    });

    return this.areaRepository.save(area);
  }

  async remove(id: number): Promise<Area> {
    await this.findOne(id);

    await this.areaRepository.update(id, {
      isActive: false,
    });

    return this.areaRepository.findOne({
      where: {
        id,
        isActive: false,
      },
    });
  }
}
