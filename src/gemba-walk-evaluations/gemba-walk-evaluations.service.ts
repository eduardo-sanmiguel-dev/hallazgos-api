import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

import { FindManyOptions, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { findPaginated } from 'shared/utils';
import type { Request } from 'express';

import {
  CreateGembaWalkEvaluationDto,
  QueryGembaWalkEvaluationDto,
  UpdateGembaWalkEvaluationDto,
} from './dto';
import { GembaWalkEvaluation } from './entities/gemba-walk-evaluation.entity';
import { User } from 'users/entities/user.entity';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';

@Injectable()
export class GembaWalkEvaluationsService {
  private readonly relations = ['createdBy', 'updatedBy', 'manufacturingPlant'];

  constructor(
    @InjectRepository(GembaWalkEvaluation)
    private readonly gembaWalkEvaluationRepository: Repository<GembaWalkEvaluation>,
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
    @Inject(REQUEST)
    private readonly request: Request,
  ) {}

  // Un área no se repite dentro de la misma planta y categoría.
  private async validateUniqueActive(
    area: string,
    category: string,
    manufacturingPlantId: number,
    excludeId?: number,
  ) {
    const qb = this.gembaWalkEvaluationRepository
      .createQueryBuilder('evaluation')
      .where('LOWER(evaluation.area) = LOWER(:area)', { area })
      .andWhere('evaluation.category = :category', { category })
      .andWhere('evaluation.manufacturingPlantId = :manufacturingPlantId', {
        manufacturingPlantId,
      })
      .andWhere('evaluation.isActive = :isActive', { isActive: true });

    if (excludeId) {
      qb.andWhere('evaluation.id <> :excludeId', { excludeId });
    }

    if (await qb.getOne()) {
      throw new BadRequestException(
        'Ya existe un concepto activo con esa área y categoría en la planta seleccionada',
      );
    }
  }

  async create(
    createGembaWalkEvaluationDto: CreateGembaWalkEvaluationDto,
  ): Promise<GembaWalkEvaluation> {
    const { id: createdBy } = this.request['user'] as User;
    const { manufacturingPlantId, category } = createGembaWalkEvaluationDto;
    const area = createGembaWalkEvaluationDto.area.trim();
    const description = createGembaWalkEvaluationDto.description.trim();

    await this.manufacturingPlantsService.findOne(manufacturingPlantId);
    await this.validateUniqueActive(area, category, manufacturingPlantId);

    const gembaWalkEvaluation = this.gembaWalkEvaluationRepository.create({
      area,
      category,
      description,
      manufacturingPlant: { id: manufacturingPlantId },
      createdBy: { id: createdBy } as User,
      createdAt: new Date(),
    });

    const saved =
      await this.gembaWalkEvaluationRepository.save(gembaWalkEvaluation);

    return this.findOne(saved.id);
  }

  async findAll(queryGembaWalkEvaluationDto: QueryGembaWalkEvaluationDto) {
    const { page, limit } = queryGembaWalkEvaluationDto;
    const { manufacturingPlantId, category, search } =
      queryGembaWalkEvaluationDto;

    const where: FindOptionsWhere<GembaWalkEvaluation> = {
      isActive: true,
      ...(category && { category }),
      manufacturingPlant: {
        isActive: true,
        ...(manufacturingPlantId && { id: manufacturingPlantId }),
      },
    };

    const term = search?.trim();

    const options: FindManyOptions<GembaWalkEvaluation> = {
      where: term
        ? [
            { ...where, area: ILike(`%${term}%`) },
            { ...where, description: ILike(`%${term}%`) },
          ]
        : where,
      relations: this.relations,
      order: {
        id: 'DESC',
      },
    };

    return page && limit
      ? findPaginated(this.gembaWalkEvaluationRepository, options, page, limit)
      : this.gembaWalkEvaluationRepository.find(options);
  }

  async findOne(id: number, isActive = true): Promise<GembaWalkEvaluation> {
    const gembaWalkEvaluation =
      await this.gembaWalkEvaluationRepository.findOne({
        where: { id },
        relations: this.relations,
      });

    if (!gembaWalkEvaluation) {
      throw new NotFoundException(`Concepto con ID ${id} no encontrado`);
    }

    if (isActive && !gembaWalkEvaluation.isActive) {
      throw new BadRequestException(`El concepto con ID ${id} esta inactivo`);
    }

    return gembaWalkEvaluation;
  }

  async update(
    id: number,
    updateGembaWalkEvaluationDto: UpdateGembaWalkEvaluationDto,
  ): Promise<GembaWalkEvaluation> {
    const { id: updatedBy } = this.request['user'] as User;
    const current = await this.findOne(id);

    const manufacturingPlantId =
      updateGembaWalkEvaluationDto.manufacturingPlantId ||
      current.manufacturingPlant.id;
    const area = updateGembaWalkEvaluationDto.area?.trim() || current.area;
    const category = updateGembaWalkEvaluationDto.category || current.category;
    const description =
      updateGembaWalkEvaluationDto.description?.trim() || current.description;

    await this.manufacturingPlantsService.findOne(manufacturingPlantId);
    await this.validateUniqueActive(area, category, manufacturingPlantId, id);

    const gembaWalkEvaluation =
      await this.gembaWalkEvaluationRepository.preload({
        id,
        area,
        category,
        description,
        manufacturingPlant: { id: manufacturingPlantId },
        updatedBy: { id: updatedBy } as User,
        updatedAt: new Date(),
      });

    const saved =
      await this.gembaWalkEvaluationRepository.save(gembaWalkEvaluation);

    return this.findOne(saved.id);
  }

  async remove(id: number): Promise<GembaWalkEvaluation> {
    const { id: updatedBy } = this.request['user'] as User;
    const gembaWalkEvaluation = await this.findOne(id);

    gembaWalkEvaluation.isActive = false;
    gembaWalkEvaluation.updatedBy = { id: updatedBy } as User;
    gembaWalkEvaluation.updatedAt = new Date();

    return this.gembaWalkEvaluationRepository.save(gembaWalkEvaluation);
  }
}
