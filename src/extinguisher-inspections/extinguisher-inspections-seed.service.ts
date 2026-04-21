import { existsSync } from 'fs';
import { join } from 'path';

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { Repository } from 'typeorm';

import {
  EmergencyTeam,
  ExtinguisherType,
} from 'emergency-teams/entities/emergency-team.entity';
import { ExtinguisherInspection } from './entities/extinguisher-inspection.entity';
import {
  EvaluationValues,
  ExtinguisherInspectionEvaluation,
} from './entities/extinguisher-inspection-evaluation.entity';

type SeedEvaluationInput = {
  location: string;
  extinguisherNumber: number;
  typeOfExtinguisher: ExtinguisherType;
  capacity: number;
  pressureManometer: EvaluationValues;
  valve: EvaluationValues;
  hose: EvaluationValues;
  cylinder: EvaluationValues;
  barrette: EvaluationValues;
  seal: EvaluationValues;
  cornet: EvaluationValues;
  access: EvaluationValues;
  support: EvaluationValues;
  signaling: EvaluationValues;
  nextRechargeDate: Date;
  maintenanceDate: Date;
  observations: string;
};

@Injectable()
export class ExtinguisherInspectionsSeedService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(ExtinguisherInspectionsSeedService.name);

  private readonly manufacturingPlantId = 2;
  private readonly responsibleId = 2;
  private readonly createdById = 2;
  private readonly inspectionDate = '2023-12-29';

  private readonly sourceExcelPath = join(
    process.cwd(),
    'src',
    'files',
    'RGOSGSST49.xlsx',
  );
  private readonly sourceSheetPrefix = 'RESGISTRO EXTINTORES';
  private readonly firstDataRow = 9;

  private readonly col = {
    location: 2,
    extinguisherNumber: 3,
    typeOfExtinguisher: 4,
    capacity: 5,
    pressureManometer: 6,
    valve: 7,
    hose: 8,
    cylinder: 9,
    barrette: 10,
    seal: 11,
    cornet: 12,
    access: 13,
    support: 14,
    signaling: 15,
    maintenanceDate: 16,
    nextRechargeDate: 17,
    observations1: 18,
    observations2: 19,
  } as const;

  constructor(
    @InjectRepository(ExtinguisherInspection)
    private readonly inspectionRepository: Repository<ExtinguisherInspection>,
    @InjectRepository(ExtinguisherInspectionEvaluation)
    private readonly evaluationRepository: Repository<ExtinguisherInspectionEvaluation>,
    @InjectRepository(EmergencyTeam)
    private readonly emergencyTeamRepository: Repository<EmergencyTeam>,
  ) {}

  async onApplicationBootstrap() {
    const alreadyExists = await this.inspectionRepository.exists({
      where: {
        isActive: true,
        manufacturingPlant: { id: this.manufacturingPlantId },
        responsible: { id: this.responsibleId },
        inspectionDate: new Date(this.inspectionDate),
      },
    });

    if (alreadyExists) {
      this.logger.log(
        `Seed omitido: ya existe inspeccion para planta=${this.manufacturingPlantId}, responsable=${this.responsibleId}, fecha=${this.inspectionDate}.`,
      );
      return;
    }

    const evaluations = await this.loadSeedEvaluations();
    if (!evaluations.length) {
      this.logger.warn(
        'Seed omitido: no se encontraron evaluaciones en RGOSGSST49.xlsx ni en emergency_teams.',
      );
      return;
    }

    const now = new Date();

    const inspection = this.inspectionRepository.create({
      inspectionDate: this.inspectionDate,
      manufacturingPlant: { id: this.manufacturingPlantId },
      responsible: { id: this.responsibleId },
      createdBy: { id: this.createdById },
      createdAt: now,
    });

    const savedInspection = await this.inspectionRepository.save(inspection);

    const entities = evaluations.map((evaluation) =>
      this.evaluationRepository.create({
        ...evaluation,
        extinguisherInspection: { id: savedInspection.id },
        createdBy: { id: this.createdById },
        createdAt: now,
      }),
    );

    await this.evaluationRepository.save(entities);

    this.logger.log(
      `Seed aplicado: creada inspeccion ${savedInspection.id} con ${entities.length} evaluaciones.`,
    );
  }

  private async loadSeedEvaluations(): Promise<SeedEvaluationInput[]> {
    const fromExcel = await this.loadFromExcel();
    if (fromExcel.length) {
      return fromExcel;
    }

    return this.loadFromEmergencyTeams();
  }

  private async loadFromExcel(): Promise<SeedEvaluationInput[]> {
    if (!existsSync(this.sourceExcelPath)) {
      this.logger.warn(
        `No se encontro ${this.sourceExcelPath}; se usara fallback desde emergency_teams.`,
      );
      return [];
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.sourceExcelPath);

    const worksheets = workbook.worksheets.filter((sheet) =>
      sheet.name.startsWith(this.sourceSheetPrefix),
    );

    if (!worksheets.length) {
      this.logger.warn(
        `No se encontraron hojas con prefijo ${this.sourceSheetPrefix} en RGOSGSST49.xlsx; se usara fallback desde emergency_teams.`,
      );
      return [];
    }

    const rows: SeedEvaluationInput[] = [];
    const seenExtinguisherNumbers = new Set<number>();

    for (const worksheet of worksheets) {
      const maxRow = worksheet.rowCount;
      let emptyStreak = 0;

      for (
        let rowNumber = this.firstDataRow;
        rowNumber <= maxRow;
        rowNumber++
      ) {
        const row = worksheet.getRow(rowNumber);
        const hasRowData = this.hasAnyData(row, [
          this.col.location,
          this.col.extinguisherNumber,
          this.col.typeOfExtinguisher,
          this.col.capacity,
          this.col.pressureManometer,
          this.col.valve,
          this.col.hose,
          this.col.cylinder,
          this.col.barrette,
          this.col.seal,
          this.col.cornet,
          this.col.access,
          this.col.support,
          this.col.signaling,
          this.col.maintenanceDate,
          this.col.nextRechargeDate,
          this.col.observations1,
          this.col.observations2,
        ]);

        if (!hasRowData) {
          emptyStreak += 1;
          if (emptyStreak >= 5) {
            break;
          }
          continue;
        }

        emptyStreak = 0;

        const extinguisherNumber = this.toNumber(
          this.getCellValue(row, this.col.extinguisherNumber),
        );

        if (!extinguisherNumber || extinguisherNumber <= 0) {
          continue;
        }

        if (seenExtinguisherNumbers.has(extinguisherNumber)) {
          continue;
        }

        seenExtinguisherNumbers.add(extinguisherNumber);

        const nextRechargeDate = this.toDateOrDefault(
          this.getCellValue(row, this.col.nextRechargeDate),
        );
        const maintenanceDate = this.toDateOrDefault(
          this.getCellValue(row, this.col.maintenanceDate),
        );

        const observations =
          this.toString(this.getCellValue(row, this.col.observations1)) ||
          this.toString(this.getCellValue(row, this.col.observations2)) ||
          '';

        rows.push({
          location:
            this.toString(this.getCellValue(row, this.col.location)) ||
            `Extintor ${extinguisherNumber}`,
          extinguisherNumber,
          typeOfExtinguisher: this.normalizeTypeOfExtinguisher(
            this.getCellValue(row, this.col.typeOfExtinguisher),
          ),
          capacity:
            this.toNumber(this.getCellValue(row, this.col.capacity)) || 10,
          pressureManometer: this.normalizeEvaluation(
            this.getCellValue(row, this.col.pressureManometer),
          ),
          valve: this.normalizeEvaluation(
            this.getCellValue(row, this.col.valve),
          ),
          hose: this.normalizeEvaluation(this.getCellValue(row, this.col.hose)),
          cylinder: this.normalizeEvaluation(
            this.getCellValue(row, this.col.cylinder),
          ),
          barrette: this.normalizeEvaluation(
            this.getCellValue(row, this.col.barrette),
          ),
          seal: this.normalizeEvaluation(this.getCellValue(row, this.col.seal)),
          cornet: this.normalizeEvaluation(
            this.getCellValue(row, this.col.cornet),
          ),
          access: this.normalizeEvaluation(
            this.getCellValue(row, this.col.access),
          ),
          support: this.normalizeEvaluation(
            this.getCellValue(row, this.col.support),
          ),
          signaling: this.normalizeEvaluation(
            this.getCellValue(row, this.col.signaling),
          ),
          nextRechargeDate,
          maintenanceDate,
          observations,
        });
      }
    }

    if (rows.length) {
      this.logger.log(
        `Se cargaron ${rows.length} evaluaciones desde RGOSGSST49.xlsx (${worksheets.length} hojas).`,
      );
    }

    return rows;
  }

  private async loadFromEmergencyTeams(): Promise<SeedEvaluationInput[]> {
    const emergencyTeams = await this.emergencyTeamRepository.find({
      where: {
        isActive: true,
        manufacturingPlant: { id: this.manufacturingPlantId },
      },
      order: {
        extinguisherNumber: 'ASC',
      },
    });

    const defaultDate = this.toDateOrDefault(null);

    return emergencyTeams.map((item) => ({
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
      nextRechargeDate: defaultDate,
      maintenanceDate: defaultDate,
      observations: '',
    }));
  }

  private normalizeEvaluation(raw: unknown): EvaluationValues {
    const value = this.normalizeHeader(raw);

    const yesValues = new Set([
      'c',
      'conforme',
      'cumple',
      'ok',
      'si',
      'x',
      'true',
      '1',
    ]);

    const noValues = new Set([
      'nc',
      'noconforme',
      'nocumple',
      'no',
      'false',
      '0',
      'mal',
    ]);

    const naValues = new Set(['na', 'n/a', 'noaplica', 's/aplica', 's/a', '2']);

    if (yesValues.has(value)) {
      return EvaluationValues.C;
    }

    if (noValues.has(value)) {
      return EvaluationValues.NC;
    }

    if (naValues.has(value)) {
      return EvaluationValues.NA;
    }

    return EvaluationValues.C;
  }

  private normalizeTypeOfExtinguisher(raw: unknown): ExtinguisherType {
    const value = this.normalizeHeader(raw);

    if (value.includes('co2')) {
      return ExtinguisherType.CO2;
    }

    if (value.includes('afff') || value.includes('espuma')) {
      return ExtinguisherType.AFFF;
    }

    return ExtinguisherType.PQS;
  }

  private toDateOrDefault(raw: unknown): Date {
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      return raw;
    }

    if (typeof raw === 'number' && raw > 0) {
      const date = new Date(Math.round((raw - 25569) * 86400 * 1000));
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    if (typeof raw === 'string') {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return new Date(this.inspectionDate);
  }

  private toNumber(raw: unknown): number {
    if (typeof raw === 'number') {
      return raw;
    }

    if (typeof raw === 'string') {
      const normalized = raw.replace(',', '.').trim();
      const parsed = Number(normalized);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return 0;
  }

  private toString(raw: unknown): string {
    if (raw === null || raw === undefined) {
      return '';
    }

    if (typeof raw === 'object' && raw && 'text' in (raw as any)) {
      return String((raw as any).text ?? '').trim();
    }

    if (typeof raw === 'object' && raw && 'richText' in (raw as any)) {
      return String(
        ((raw as any).richText || [])
          .map((item: { text?: string }) => item.text || '')
          .join(''),
      ).trim();
    }

    return String(raw).trim();
  }

  private normalizeHeader(value: unknown): string {
    return this.toString(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/_/g, '')
      .trim();
  }

  private hasAnyData(row: ExcelJS.Row, columnsToCheck: number[]): boolean {
    return columnsToCheck.some((col) => {
      const value = this.getCellValue(row, col);
      return this.toString(value) !== '';
    });
  }

  private getCellValue(row: ExcelJS.Row, colNumber: number): unknown {
    return row.getCell(colNumber).value;
  }
}
