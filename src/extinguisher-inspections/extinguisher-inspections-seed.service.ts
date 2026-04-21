import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { EmergencyTeam } from 'emergency-teams/entities/emergency-team.entity';
import { User } from 'users/entities/user.entity';

import { ExtinguisherInspectionEvaluation } from './entities/extinguisher-inspection-evaluation.entity';
import { ExtinguisherInspection } from './entities/extinguisher-inspection.entity';
import { EvaluationValues } from './entities/extinguisher-inspection-evaluation.entity';

@Injectable()
export class ExtinguisherInspectionsSeedService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(ExtinguisherInspectionsSeedService.name);

  constructor(
    @InjectRepository(ExtinguisherInspection)
    private readonly extinguisherInspectionRepository: Repository<ExtinguisherInspection>,
    @InjectRepository(ExtinguisherInspectionEvaluation)
    private readonly extinguisherInspectionEvaluationRepository: Repository<ExtinguisherInspectionEvaluation>,
    @InjectRepository(EmergencyTeam)
    private readonly emergencyTeamRepository: Repository<EmergencyTeam>,
  ) {}

  async onApplicationBootstrap() {
    await this.seedHistoricalInspection();
  }

  private async seedHistoricalInspection() {
    const manufacturingPlantId = 2;
    const responsibleId = 1;
    const createdById = 1;
    const inspectionDate = '2023-12-29';
    const maintenanceDate = '2024-08-01';
    const nextRechargeDate = '2024-08-01';

    const existingInspection = await this.extinguisherInspectionRepository
      .createQueryBuilder('inspection')
      .leftJoin('inspection.manufacturingPlant', 'plant')
      .leftJoin('inspection.responsible', 'responsible')
      .where('plant.id = :manufacturingPlantId', { manufacturingPlantId })
      .andWhere('responsible.id = :responsibleId', { responsibleId })
      .andWhere('inspection.inspectionDate = :inspectionDate', {
        inspectionDate,
      })
      .andWhere('inspection.isActive = :isActive', { isActive: true })
      .getOne();

    if (existingInspection) {
      this.logger.log(
        'Seed de inspeccion historica ya existe. No se inserta duplicado.',
      );
      return;
    }

    const emergencyTeams = await this.emergencyTeamRepository
      .createQueryBuilder('emergencyTeam')
      .leftJoin('emergencyTeam.manufacturingPlant', 'plant')
      .where('plant.id = :manufacturingPlantId', { manufacturingPlantId })
      .andWhere('emergencyTeam.isActive = :isActive', { isActive: true })
      .orderBy('emergencyTeam.extinguisherNumber', 'ASC')
      .getMany();

    if (!emergencyTeams.length) {
      this.logger.warn(
        'No se encontraron emergency_teams activos para planta 2. Seed omitido.',
      );
      return;
    }

    const now = new Date();

    const inspection = this.extinguisherInspectionRepository.create({
      inspectionDate: new Date(`${inspectionDate}T00:00:00.000Z`),
      responsible: { id: responsibleId } as User,
      manufacturingPlant: { id: manufacturingPlantId },
      createdBy: { id: createdById } as User,
      createdAt: now,
    });

    const savedInspection =
      await this.extinguisherInspectionRepository.save(inspection);

    const evaluations = emergencyTeams.map((item) =>
      this.extinguisherInspectionEvaluationRepository.create({
        location: item.location,
        extinguisherNumber: item.extinguisherNumber,
        typeOfExtinguisher: item.typeOfExtinguisher,
        capacity: Number(item.capacity),
        pressureManometer: EvaluationValues.C,
        valve: EvaluationValues.C,
        hose: EvaluationValues.C,
        cylinder: EvaluationValues.C,
        barrette: EvaluationValues.C,
        seal: EvaluationValues.C,
        cornet: EvaluationValues.C,
        access: EvaluationValues.C,
        support: EvaluationValues.C,
        signaling: EvaluationValues.C,
        maintenanceDate: new Date(`${maintenanceDate}T00:00:00.000Z`),
        nextRechargeDate: new Date(`${nextRechargeDate}T00:00:00.000Z`),
        observations: '',
        createdBy: { id: createdById } as User,
        createdAt: now,
        extinguisherInspection: { id: savedInspection.id },
      }),
    );

    await this.extinguisherInspectionEvaluationRepository.save(evaluations);

    this.logger.log(
      `Seed de inspeccion historica creado. Inspeccion ID: ${savedInspection.id}, evaluaciones: ${evaluations.length}`,
    );
  }
}
