import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { ExtinguisherType } from 'emergency-teams/entities/emergency-team.entity';
import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import {
  EvaluationValues,
  ExtinguisherInspectionEvaluation,
} from './entities/extinguisher-inspection-evaluation.entity';
import { ExtinguisherInspection } from './entities/extinguisher-inspection.entity';
import { User } from 'users/entities/user.entity';
import { EXTINGUISHER_INSPECTION_SEED_DATA } from './extinguisher-inspections-seed.data';

@Injectable()
export class ExtinguisherInspectionsSeedService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(ExtinguisherInspectionsSeedService.name);

  private readonly manufacturingPlantId = 2;
  private readonly createdById = 2;
  private readonly responsibleId = 2;
  private readonly seedInspectionDate = '2023-12-29';

  constructor(
    @InjectRepository(ExtinguisherInspection)
    private readonly inspectionRepository: Repository<ExtinguisherInspection>,
    @InjectRepository(ExtinguisherInspectionEvaluation)
    private readonly evaluationRepository: Repository<ExtinguisherInspectionEvaluation>,
  ) {}

  async onApplicationBootstrap() {
    await this.seed();
  }

  private async seed() {
    let inspection = await this.inspectionRepository
      .createQueryBuilder('inspection')
      .where('inspection.manufacturingPlantId = :manufacturingPlantId', {
        manufacturingPlantId: this.manufacturingPlantId,
      })
      .andWhere('inspection.responsibleId = :responsibleId', {
        responsibleId: this.responsibleId,
      })
      .andWhere('inspection.inspectionDate = :inspectionDate', {
        inspectionDate: this.seedInspectionDate,
      })
      .getOne();

    if (!inspection) {
      inspection = await this.inspectionRepository.save(
        this.inspectionRepository.create({
          responsible: { id: this.responsibleId } as User,
          inspectionDate: this.seedInspectionDate as unknown as Date,
          manufacturingPlant: {
            id: this.manufacturingPlantId,
          } as ManufacturingPlant,
          createdBy: { id: this.createdById } as User,
        }),
      );
    }

    const existingEvaluations = await this.evaluationRepository.find({
      where: {
        extinguisherInspection: { id: inspection.id },
      },
    });

    const existingKeys = new Set(
      existingEvaluations.map((item) => this.getEvaluationKey(item)),
    );

    const evaluationsToCreate: ExtinguisherInspectionEvaluation[] = [];

    for (const item of EXTINGUISHER_INSPECTION_SEED_DATA) {
      const extinguisherNumber = Number(item.extinguisherNumber);
      const capacity = Number(item.capacity);
      const typeOfExtinguisher = this.parseExtinguisherType(
        item.typeOfExtinguisher,
      );

      if (!typeOfExtinguisher) {
        this.logger.warn(
          `Registro omitido por tipo de extintor invalido: ${item.typeOfExtinguisher}`,
        );
        continue;
      }

      if (Number.isNaN(extinguisherNumber) || Number.isNaN(capacity)) {
        this.logger.warn(
          `Registro omitido por valores numericos invalidos: ${item.location}`,
        );
        continue;
      }

      const seedKey = this.getEvaluationSeedKey(item, typeOfExtinguisher);
      if (existingKeys.has(seedKey)) {
        continue;
      }

      evaluationsToCreate.push(
        this.evaluationRepository.create({
          location: item.location,
          extinguisherNumber,
          typeOfExtinguisher,
          capacity,
          pressureManometer: this.parseEvaluationValue(item.pressureManometer),
          valve: this.parseEvaluationValue(item.valve),
          hose: this.parseEvaluationValue(item.hose),
          cylinder: this.parseEvaluationValue(item.cylinder),
          barrette: this.parseEvaluationValue(item.barrette),
          seal: this.parseEvaluationValue(item.seal),
          cornet: this.parseEvaluationValue(item.cornet),
          access: this.parseEvaluationValue(item.access),
          support: this.parseEvaluationValue(item.support),
          signaling: this.parseEvaluationValue(item.signaling),
          nextRechargeDate: item.nextRechargeDate as unknown as Date,
          maintenanceDate: item.maintenanceDate as unknown as Date,
          observations: item.observations || null,
          createdBy: { id: this.createdById } as User,
          extinguisherInspection: inspection,
        }),
      );
    }

    if (evaluationsToCreate.length > 0) {
      await this.evaluationRepository.save(evaluationsToCreate);
    }

    this.logger.log(
      `ExtinguisherInspections seed ejecutado. Inspeccion: ${inspection.id}, nuevas evaluaciones: ${evaluationsToCreate.length}, existentes: ${existingEvaluations.length}`,
    );
  }

  private parseExtinguisherType(value: string): ExtinguisherType | null {
    if (Object.values(ExtinguisherType).includes(value as ExtinguisherType)) {
      return value as ExtinguisherType;
    }

    return null;
  }

  private parseEvaluationValue(value: string): EvaluationValues {
    if (Object.values(EvaluationValues).includes(value as EvaluationValues)) {
      return value as EvaluationValues;
    }

    return EvaluationValues.C;
  }

  private getEvaluationKey(item: ExtinguisherInspectionEvaluation): string {
    return [
      item.location.trim().toLowerCase(),
      item.extinguisherNumber,
      item.typeOfExtinguisher,
      Number(item.capacity).toFixed(2),
      this.toDateString(item.nextRechargeDate),
      this.toDateString(item.maintenanceDate),
    ].join('|');
  }

  private getEvaluationSeedKey(
    item: (typeof EXTINGUISHER_INSPECTION_SEED_DATA)[number],
    typeOfExtinguisher: ExtinguisherType,
  ): string {
    return [
      item.location.trim().toLowerCase(),
      Number(item.extinguisherNumber),
      typeOfExtinguisher,
      Number(item.capacity).toFixed(2),
      item.nextRechargeDate,
      item.maintenanceDate,
    ].join('|');
  }

  private toDateString(value: Date): string {
    if (!value) {
      return '';
    }

    return new Date(value).toISOString().slice(0, 10);
  }
}
