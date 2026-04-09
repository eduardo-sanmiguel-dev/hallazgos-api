import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';

import { Brackets, Repository } from 'typeorm';
import { Request } from 'express';

import { ExtinguisherInspection } from './entities/extinguisher-inspection.entity';
import { ExtinguisherInspectionEvaluation } from './entities/extinguisher-inspection-evaluation.entity';
import { User } from 'users/entities/user.entity';
import {
  CreateExtinguisherInspectionDto,
  QueryExtinguisherInspectionDto,
  UpdateExtinguisherInspectionDto,
} from './dto';

@Injectable()
export class ExtinguisherInspectionsService {
  private readonly relations = [
    'createdBy',
    'updatedBy',
    'manufacturingPlant',
    'evaluations',
  ];

  constructor(
    @InjectRepository(ExtinguisherInspection)
    private readonly extinguisherInspectionRepository: Repository<ExtinguisherInspection>,
    @InjectRepository(ExtinguisherInspectionEvaluation)
    private readonly extinguisherInspectionEvaluationRepository: Repository<ExtinguisherInspectionEvaluation>,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  async create(
    createExtinguisherInspectionDto: CreateExtinguisherInspectionDto,
  ) {
    const { id: createdBy } = this.request['user'] as User;
    const now = new Date();
    const todayString = now.toISOString().split('T')[0];

    const {
      manufacturingPlantId,
      evaluations = [],
      ...rest
    } = createExtinguisherInspectionDto;

    const hasPastDates = evaluations.some(
      (evaluation) =>
        evaluation.nextRechargeDate < todayString ||
        evaluation.maintenanceDate < todayString,
    );

    if (hasPastDates) {
      throw new BadRequestException(
        'No se permiten fechas de próxima recarga o mantenimiento anteriores a la fecha actual.',
      );
    }

    const extinguisherInspection = this.extinguisherInspectionRepository.create(
      {
        ...rest,
        inspectionDate: now,
        responsible: { id: createdBy },
        manufacturingPlant: { id: manufacturingPlantId },
        createdBy: { id: createdBy } as User,
        createdAt: now,
      },
    );

    const savedExtinguisherInspection =
      await this.extinguisherInspectionRepository.save(extinguisherInspection);

    const evaluationsToSave = evaluations.map((evaluation) =>
      this.extinguisherInspectionEvaluationRepository.create({
        ...evaluation,
        extinguisherInspection: { id: savedExtinguisherInspection.id },
        createdBy: { id: createdBy } as User,
        createdAt: now,
      }),
    );

    await this.extinguisherInspectionEvaluationRepository.save(
      evaluationsToSave,
    );

    return this.findOne(savedExtinguisherInspection.id);
  }

  findAll(queryExtinguisherInspectionDto: QueryExtinguisherInspectionDto) {
    const { search, manufacturingPlantId, responsibleId } =
      queryExtinguisherInspectionDto;

    const queryBuilder = this.extinguisherInspectionRepository
      .createQueryBuilder('extinguisherInspection')
      .leftJoinAndSelect('extinguisherInspection.createdBy', 'createdBy')
      .leftJoinAndSelect('extinguisherInspection.updatedBy', 'updatedBy')
      .leftJoinAndSelect(
        'extinguisherInspection.manufacturingPlant',
        'manufacturingPlant',
      )
      .leftJoinAndSelect('extinguisherInspection.responsible', 'responsible')
      .leftJoinAndSelect(
        'extinguisherInspection.evaluations',
        'evaluations',
        'evaluations.isActive = :evaluationIsActive',
        { evaluationIsActive: true },
      )
      .where('extinguisherInspection.isActive = :isActive', { isActive: true })
      .orderBy('extinguisherInspection.id', 'DESC');

    if (search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('CAST(extinguisherInspection.id AS TEXT) ILIKE :search', {
            search: `%${search}%`,
          }).orWhere('responsible.name ILIKE :search', {
            search: `%${search}%`,
          });
        }),
      );
    }

    if (manufacturingPlantId) {
      queryBuilder.andWhere('manufacturingPlant.id = :manufacturingPlantId', {
        manufacturingPlantId,
      });
    }

    if (responsibleId) {
      queryBuilder.andWhere('responsible.id = :responsibleId', {
        responsibleId,
      });
    }

    return queryBuilder.getMany();
  }

  async findOne(id: number) {
    const extinguisherInspection = await this.extinguisherInspectionRepository
      .createQueryBuilder('extinguisherInspection')
      .leftJoinAndSelect('extinguisherInspection.createdBy', 'createdBy')
      .leftJoinAndSelect('extinguisherInspection.updatedBy', 'updatedBy')
      .leftJoinAndSelect(
        'extinguisherInspection.manufacturingPlant',
        'manufacturingPlant',
      )
      .leftJoinAndSelect('extinguisherInspection.responsible', 'responsible')
      .leftJoinAndSelect(
        'extinguisherInspection.evaluations',
        'evaluations',
        'evaluations.isActive = :evaluationIsActive',
        { evaluationIsActive: true },
      )
      .where('extinguisherInspection.id = :id', { id })
      .andWhere('extinguisherInspection.isActive = :isActive', {
        isActive: true,
      })
      .getOne();

    if (!extinguisherInspection) {
      throw new NotFoundException(
        `Extinguisher inspection with id ${id} not found`,
      );
    }

    return extinguisherInspection;
  }

  async update(
    id: number,
    updateExtinguisherInspectionDto: UpdateExtinguisherInspectionDto,
  ) {
    const { id: updatedBy } = this.request['user'] as User;
    const {
      manufacturingPlantId,
      evaluations,
      ...restUpdateExtinguisherInspectionDto
    } = updateExtinguisherInspectionDto;

    const extinguisherInspection = await this.findOne(id);

    const updatedExtinguisherInspection =
      this.extinguisherInspectionRepository.merge(
        extinguisherInspection,
        restUpdateExtinguisherInspectionDto,
        manufacturingPlantId
          ? {
              manufacturingPlant: {
                id: manufacturingPlantId,
              },
            }
          : {},
        { updatedBy: { id: updatedBy } as User },
        { updatedAt: new Date() },
      );

    await this.extinguisherInspectionRepository.save(
      updatedExtinguisherInspection,
    );

    if (evaluations) {
      await this.extinguisherInspectionEvaluationRepository
        .createQueryBuilder()
        .update(ExtinguisherInspectionEvaluation)
        .set({
          isActive: false,
          updatedBy: { id: updatedBy } as User,
          updatedAt: new Date(),
        })
        .where('extinguisherInspection.id = :id', { id })
        .andWhere('isActive = :isActive', { isActive: true })
        .execute();

      if (evaluations.length) {
        const evaluationsToSave = evaluations.map((evaluation) =>
          this.extinguisherInspectionEvaluationRepository.create({
            ...evaluation,
            extinguisherInspection: { id },
            createdBy: { id: updatedBy } as User,
            createdAt: new Date(),
          }),
        );

        await this.extinguisherInspectionEvaluationRepository.save(
          evaluationsToSave,
        );
      }
    }

    return this.findOne(id);
  }

  async remove(id: number) {
    const { id: updatedBy } = this.request['user'] as User;

    const extinguisherInspection = await this.findOne(id);

    extinguisherInspection.isActive = false;
    extinguisherInspection.updatedBy = { id: updatedBy } as User;
    extinguisherInspection.updatedAt = new Date();

    await this.extinguisherInspectionRepository.save(extinguisherInspection);

    await this.extinguisherInspectionEvaluationRepository
      .createQueryBuilder()
      .update(ExtinguisherInspectionEvaluation)
      .set({
        isActive: false,
        updatedBy: { id: updatedBy } as User,
        updatedAt: new Date(),
      })
      .where('extinguisherInspection.id = :id', { id })
      .andWhere('isActive = :isActive', { isActive: true })
      .execute();

    return this.findOneRemoved(id);
  }

  private async findOneRemoved(id: number) {
    const extinguisherInspection =
      await this.extinguisherInspectionRepository.findOne({
        where: { id, isActive: false },
        relations: this.relations,
      });

    if (!extinguisherInspection) {
      throw new NotFoundException(
        `Extinguisher inspection with id ${id} not found`,
      );
    }

    return extinguisherInspection;
  }
}
