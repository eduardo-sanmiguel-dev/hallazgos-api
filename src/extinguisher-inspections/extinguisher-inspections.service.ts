import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestContextService } from 'shared/services/request-context.service';

import { Brackets, Repository, In } from 'typeorm';

import { ExtinguisherInspection } from './entities/extinguisher-inspection.entity';
import { ExtinguisherInspectionEvaluation } from './entities/extinguisher-inspection-evaluation.entity';
import { User } from 'users/entities/user.entity';
import {
  CreateExtinguisherInspectionDto,
  QueryExtinguisherInspectionDto,
  UpdateExtinguisherInspectionDto,
} from './dto';
import { buildInspectionFileName } from './extinguisher-inspection-file-name';
import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { PLANT_TIME_ZONES, toPlantCountry, toWallClock } from '@shared/utils';

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
    private readonly requestContext: RequestContextService,
  ) {}

  async create(
    createExtinguisherInspectionDto: CreateExtinguisherInspectionDto,
  ) {
    const createdBy = this.requestContext.userId;
    const now = new Date();

    const {
      manufacturingPlantId,
      evaluations = [],
      ...rest
    } = createExtinguisherInspectionDto;

    this.requestContext.assertManufacturingPlant(manufacturingPlantId);
    const todayString = await this.plantToday(manufacturingPlantId, now);

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

    const savedId =
      await this.extinguisherInspectionRepository.manager.transaction(
        async (manager) => {
          const inspectionRepository = manager.getRepository(
            ExtinguisherInspection,
          );
          const evaluationRepository = manager.getRepository(
            ExtinguisherInspectionEvaluation,
          );
          const extinguisherInspection = inspectionRepository.create({
            ...rest,
            inspectionDate: now,
            responsible: { id: createdBy },
            manufacturingPlant: { id: manufacturingPlantId },
            createdBy: { id: createdBy } as User,
            createdAt: now,
          });

          const savedExtinguisherInspection = await inspectionRepository.save(
            extinguisherInspection,
          );

          const evaluationsToSave = evaluations.map((evaluation) =>
            evaluationRepository.create({
              ...evaluation,
              extinguisherInspection: { id: savedExtinguisherInspection.id },
              createdBy: { id: createdBy } as User,
              createdAt: now,
            }),
          );

          await evaluationRepository.save(evaluationsToSave);

          return savedExtinguisherInspection.id;
        },
      );

    return this.findOne(savedId);
  }

  /**
   * "Hoy" (YYYY-MM-DD) en la zona horaria de la planta. Antes se usaba el día
   * en UTC: en México, después de las 18:00 ya era "mañana" y una fecha de
   * hoy se rechazaba como pasada.
   */
  private async plantToday(manufacturingPlantId: number, now: Date) {
    const plant = await this.extinguisherInspectionRepository.manager.findOne(
      ManufacturingPlant,
      { where: { id: manufacturingPlantId }, relations: ['country'] },
    );
    const { year, month, day } = toWallClock(
      now,
      PLANT_TIME_ZONES[toPlantCountry(plant?.country?.name)],
    );
    const pad = (value: number) => String(value).padStart(2, '0');

    return `${year}-${pad(month)}-${pad(day)}`;
  }

  async findAll(
    queryExtinguisherInspectionDto: QueryExtinguisherInspectionDto,
  ) {
    const {
      search,
      manufacturingPlantId,
      responsibleId,
      startDate,
      endDate,
      page,
      limit,
    } = queryExtinguisherInspectionDto;

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
      .andWhere('manufacturingPlant.id IN (:...allowedPlantIds)', {
        allowedPlantIds: this.requestContext.manufacturingPlantIds.length
          ? this.requestContext.manufacturingPlantIds
          : [-1],
      })
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

    if (startDate) {
      queryBuilder.andWhere(
        'extinguisherInspection.inspectionDate >= :startDate',
        {
          startDate,
        },
      );
    }

    if (endDate) {
      queryBuilder.andWhere(
        'extinguisherInspection.inspectionDate <= :endDate',
        {
          endDate,
        },
      );
    }

    if (page === undefined || limit === undefined) {
      return queryBuilder.getMany();
    }

    const limitNumber = Number(limit);

    if (limitNumber !== -1) {
      queryBuilder.skip((Number(page) - 1) * limitNumber).take(limitNumber);
    }

    const [data, count] = await queryBuilder.getManyAndCount();

    return { data, count };
  }

  /**
   * Nombre del archivo descargado. createdAt se lee como texto (hora de pared
   * guardada) para no pasar por el Date de node-postgres.
   */
  async getDownloadFileName(id: number) {
    await this.findOne(id);
    const [row]: Array<{
      plantName: string | null;
      countryName: string | null;
      storedCreatedAt: string | null;
    }> = await this.extinguisherInspectionRepository.query(
      `SELECT mp.name AS "plantName",
              c.name AS "countryName",
              i."createdAt"::text AS "storedCreatedAt"
         FROM extinguisher_inspections i
         LEFT JOIN manufacturing_plant mp ON mp.id = i."manufacturingPlantId"
         LEFT JOIN countries c ON c.id = mp."countryId"
        WHERE i.id = $1`,
      [id],
    );

    return buildInspectionFileName({ id, ...row });
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
      .andWhere('manufacturingPlant.id IN (:...allowedPlantIds)', {
        allowedPlantIds: this.requestContext.manufacturingPlantIds.length
          ? this.requestContext.manufacturingPlantIds
          : [-1],
      })
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
    const updatedBy = this.requestContext.userId;
    const {
      manufacturingPlantId,
      evaluations,
      ...restUpdateExtinguisherInspectionDto
    } = updateExtinguisherInspectionDto;

    const extinguisherInspection = await this.findOne(id);
    if (manufacturingPlantId)
      this.requestContext.assertManufacturingPlant(manufacturingPlantId);
    if (evaluations?.length) {
      const today = await this.plantToday(
        manufacturingPlantId || extinguisherInspection.manufacturingPlant.id,
        new Date(),
      );
      if (
        evaluations.some(
          (evaluation) =>
            evaluation.nextRechargeDate < today ||
            evaluation.maintenanceDate < today,
        )
      )
        throw new BadRequestException(
          'No se permiten fechas de próxima recarga o mantenimiento anteriores a la fecha actual.',
        );
    }

    await this.extinguisherInspectionRepository.manager.transaction(
      async (manager) => {
        const inspectionRepository = manager.getRepository(
          ExtinguisherInspection,
        );
        const evaluationRepository = manager.getRepository(
          ExtinguisherInspectionEvaluation,
        );
        const updatedExtinguisherInspection = inspectionRepository.merge(
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

        await inspectionRepository.save(updatedExtinguisherInspection);

        if (evaluations) {
          await evaluationRepository
            .createQueryBuilder()
            .update(ExtinguisherInspectionEvaluation)
            .set({
              isActive: false,
              updatedBy: { id: updatedBy } as User,
              updatedAt: new Date(),
            })
            .where('"extinguisherInspectionId" = :id', { id })
            .andWhere('isActive = :isActive', { isActive: true })
            .execute();

          if (evaluations.length) {
            const evaluationsToSave = evaluations.map((evaluation) =>
              evaluationRepository.create({
                ...evaluation,
                extinguisherInspection: { id },
                createdBy: { id: updatedBy } as User,
                createdAt: new Date(),
              }),
            );

            await evaluationRepository.save(evaluationsToSave);
          }
        }
      },
    );

    return this.findOne(id);
  }

  async remove(id: number) {
    const updatedBy = this.requestContext.userId;

    const extinguisherInspection = await this.findOne(id);

    await this.extinguisherInspectionRepository.manager.transaction(
      async (manager) => {
        const inspectionRepository = manager.getRepository(
          ExtinguisherInspection,
        );
        const evaluationRepository = manager.getRepository(
          ExtinguisherInspectionEvaluation,
        );
        extinguisherInspection.isActive = false;
        extinguisherInspection.updatedBy = { id: updatedBy } as User;
        extinguisherInspection.updatedAt = new Date();

        await inspectionRepository.save(extinguisherInspection);

        await evaluationRepository
          .createQueryBuilder()
          .update(ExtinguisherInspectionEvaluation)
          .set({
            isActive: false,
            updatedBy: { id: updatedBy } as User,
            updatedAt: new Date(),
          })
          .where('"extinguisherInspectionId" = :id', { id })
          .andWhere('isActive = :isActive', { isActive: true })
          .execute();
      },
    );

    return this.findOneRemoved(id);
  }

  private async findOneRemoved(id: number) {
    const extinguisherInspection =
      await this.extinguisherInspectionRepository.findOne({
        where: {
          id,
          isActive: false,
          manufacturingPlant: {
            id: In(this.requestContext.manufacturingPlantIds),
          },
        },
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
