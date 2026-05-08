import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ILike, Repository } from 'typeorm';
import * as XlsxPopulate from 'xlsx-populate';
import * as path from 'path';

import {
  STATUS_CANCEL,
  STATUS_CLOSE,
  STATUS_IN_PROGRESS,
  STATUS_OPEN,
} from '@shared/constants';
import { MainType } from 'main-types/entities/main-type.entity';
import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { Processes } from 'processes/entities/processes.entity';
import { SecondaryType } from 'secondary-types/entities/secondary-type.entity';
import { User } from 'users/entities/user.entity';
import { Zone } from 'zones/entities/zone.entity';
import { Evidence } from './entities/evidence.entity';

type RawRow = {
  manufacturingPlant: string;
  mainType: string;
  secondaryType: string;
  zone: string;
  process: string;
  supervisor: string;
  priorityLabel: string;
  priorityDaysLabel: string;
  status: string;
};

@Injectable()
export class EvidencesSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EvidencesSeedService.name);

  private readonly defaultExcelPath = path.resolve(
    process.cwd(),
    'files',
    'victoria2.xlsx',
  );
  private readonly fallbackUserId = 1;

  private readonly priorityByLabel: Record<string, number> = {
    'corto plazo': 2,
    inmediato: 8,
    'mediano plazo': 15,
    'largo plazo': 30,
  };

  constructor(
    @InjectRepository(Evidence)
    private readonly evidenceRepository: Repository<Evidence>,
    @InjectRepository(ManufacturingPlant)
    private readonly manufacturingPlantRepository: Repository<ManufacturingPlant>,
    @InjectRepository(MainType)
    private readonly mainTypeRepository: Repository<MainType>,
    @InjectRepository(SecondaryType)
    private readonly secondaryTypeRepository: Repository<SecondaryType>,
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,
    @InjectRepository(Processes)
    private readonly processRepository: Repository<Processes>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async onApplicationBootstrap() {
    await this.seed();
  }

  private normalize(value?: string | null) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeForLike(value: string) {
    return `%${this.normalize(value)}%`;
  }

  private resolvePriorityDays(
    priorityLabel: string,
    priorityDaysLabel: string,
  ) {
    const normalizedLabel = this.normalize(priorityLabel).toLowerCase();
    if (normalizedLabel in this.priorityByLabel) {
      return this.priorityByLabel[normalizedLabel];
    }

    const match = this.normalize(priorityDaysLabel).match(/\d+/);
    if (match) {
      return Number(match[0]);
    }

    return null;
  }

  private resolveStatus(rawStatus: string) {
    const status = this.normalize(rawStatus).toLowerCase();

    if (status === 'abierto') return STATUS_OPEN;
    if (status === 'en proceso' || status === 'en progreso') {
      return STATUS_IN_PROGRESS;
    }
    if (status === 'cerrado') return STATUS_CLOSE;
    if (status === 'cancelado') return STATUS_CANCEL;

    throw new Error(`Estado no reconocido: ${rawStatus}`);
  }

  private async loadRowsFromExcel(): Promise<RawRow[]> {
    const filePath = this.defaultExcelPath;
    const workbook = await XlsxPopulate.fromFileAsync(filePath);
    const rows = workbook.sheet(0).usedRange().value() as any[][];

    if (!rows || rows.length <= 1) {
      return [];
    }

    const dataRows = rows.slice(1);
    const carry: string[] = Array(10).fill('');

    return dataRows.map((row) => {
      const values = Array.from({ length: 10 }, (_, idx) => {
        const current = this.normalize(row[idx]);
        if (current) {
          carry[idx] = current;
        }
        return carry[idx];
      });

      return {
        manufacturingPlant: values[0],
        mainType: values[1],
        secondaryType: values[2],
        zone: values[3],
        process: values[4],
        supervisor: values[5],
        priorityLabel: values[6],
        priorityDaysLabel: values[7],
        status: values[8],
      };
    });
  }

  private async seed() {
    let rows = await this.loadRowsFromExcel();

    this.logger.log(`Evidences seed: ${rows.length} filas leidas desde Excel.`);

    console.log({ rows: rows.length });

    const notUsers = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      try {
        const manufacturingPlant =
          await this.manufacturingPlantRepository.findOne({
            where: {
              name: ILike(this.normalizeForLike(row.manufacturingPlant)),
              isActive: true,
            },
          });
        if (!manufacturingPlant) {
          throw new Error(`Planta no encontrada: ${row.manufacturingPlant}`);
        }

        const mainType = await this.mainTypeRepository.findOne({
          where: {
            name: ILike(this.normalizeForLike(row.mainType)),
            isActive: true,
          },
        });
        if (!mainType) {
          throw new Error(`MainType no encontrado: ${row.mainType}`);
        }

        const secondaryType = await this.secondaryTypeRepository.findOne({
          where: {
            name: ILike(this.normalizeForLike(row.secondaryType)),
            isActive: true,
          },
          relations: ['mainType'],
        });
        if (!secondaryType) {
          throw new Error(`SecondaryType no encontrado: ${row.secondaryType}`);
        }

        const zone = await this.zoneRepository.findOne({
          where: {
            name: ILike(this.normalizeForLike(row.zone)),
            isActive: true,
            manufacturingPlant: { id: manufacturingPlant.id, isActive: true },
          },
          relations: ['manufacturingPlant', 'area'],
        });
        if (!zone) {
          console.log({ index });
          throw new Error(`Zona no encontrada: ${row.zone}`);
        }

        const process = await this.processRepository.findOne({
          where: {
            name: ILike(this.normalizeForLike(row.process)),
            isActive: true,
            manufacturingPlant: { id: manufacturingPlant.id, isActive: true },
          },
          relations: ['manufacturingPlant'],
        });
        if (!process) {
          throw new Error(`Proceso no encontrado: ${row.process}`);
        }

        const supervisor = await this.userRepository.findOne({
          where: {
            name: ILike(this.normalizeForLike(row.supervisor)),
            isActive: true,
          },
        });

        const supervisors: User[] = [];

        /* const createdBy = supervisor
          ? supervisor
          : await this.userRepository.findOne({
              where: { id: this.fallbackUserId, isActive: true },
            });

        if (!createdBy) {
          throw new Error(
            `Usuario fallback no encontrado (id=${this.fallbackUserId})`,
          );
        } */

        if (!supervisor) {
          if (!notUsers.includes(row.supervisor)) {
            if (row.supervisor.includes('-')) {
              const parts = row.supervisor
                .split('-')
                .map((part) => part.trim());
              for (const part of parts) {
                const foundUser = await this.userRepository.findOne({
                  where: {
                    name: ILike(this.normalizeForLike(part)),
                    isActive: true,
                  },
                });
                if (foundUser) {
                  supervisors.push(foundUser);
                } else {
                  if (!notUsers.includes(part)) {
                    notUsers.push(part);
                  }
                }
              }
            } else {
              if (!notUsers.includes(row.supervisor)) {
                notUsers.push(row.supervisor);
              }
            }
          }
          //throw new Error(`Supervisor no encontrado: ${row.supervisor}`);
          continue;
        }

        const priorityDays = this.resolvePriorityDays(
          row.priorityLabel,
          row.priorityDaysLabel,
        );

        const status = this.resolveStatus(row.status);
        const now = new Date(2026, 4, 4, 9, 0, 0, 0);

        await this.evidenceRepository.save(
          this.evidenceRepository.create({
            imgEvidence: 'seed-evidence.png',
            imgSolution: status === STATUS_CLOSE ? 'seed-solution.png' : '',
            imgProcess: '',
            description: row.secondaryType,
            descriptionSolution: '',
            priorityDays,
            status,
            manufacturingPlant,
            mainType,
            secondaryType,
            zone,
            process,
            solutionDate:
              status === STATUS_CLOSE
                ? priorityDays
                  ? new Date(now.getTime() + priorityDays * 24 * 60 * 60 * 1000)
                  : now
                : null,
            user: {
              id: this.fallbackUserId,
            },
            supervisors: supervisors.length ? supervisors : [supervisor],
            responsibles: supervisors.length ? supervisors : [supervisor],
            createdAt: now,
            updatedAt: now,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error en indice ${index}: ${message}`);
        throw error;
      }
    }

    console.log({ notUsers });

    this.logger.log('Evidences seed finalizado correctamente.');
  }
}
