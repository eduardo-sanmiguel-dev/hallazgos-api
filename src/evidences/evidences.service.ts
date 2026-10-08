import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  Between,
  EntityTarget,
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  Repository,
} from 'typeorm';
import { StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import XlsxPopulate from 'xlsx-populate';
import type { Request, Response } from 'express';

import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { SecondaryTypesService } from 'secondary-types/secondary-types.service';
import {
  ENV_DEVELOPMENT,
  ROLE_ADMINISTRADOR,
  STATUS_CANCEL,
  STATUS_CLOSE,
  STATUS_IN_PROGRESS,
  STATUS_OPEN,
} from '@shared/constants';
import { MainTypesService } from 'main-types/main-types.service';
import { ProcessesService } from 'processes/processes.service';
import { Evidence } from './entities/evidence.entity';
import { Comment } from './entities/comments.entity';
import { ZonesService } from 'zones/zones.service';
import { UsersService } from 'users/users.service';
import { User } from 'users/entities/user.entity';
import { MailService } from 'mail/mail.service';
import { ParamsArgs } from './inputs/args';
import {
  CommentEvidenceDto,
  CreateEvidenceDto,
  QueryEvidenceDto,
  ReassignResponsiblesDto,
  UpdateEvidenceDto,
} from './dto';
import {
  uploadStaticImage,
  stringToDateWithTime,
  getColombiaNow,
  formatUtcOffsetLong,
  formatUtcOffsetShort,
  formatWallClock,
  getOffsetMinutes,
  buildAttachmentContentDisposition,
  buildFileNameTimestamp,
  resolveTimeZone,
  sanitizeFileNamePart,
  toWallClock,
  wallClockToExcelSerial,
} from '@shared/utils';
import { MainType } from 'main-types/entities/main-type.entity';
import { SecondaryType } from 'secondary-types/entities/secondary-type.entity';
import { Area } from 'areas/entities/area.entity';
import { Zone } from 'zones/entities/zone.entity';
import { Processes } from 'processes/entities/processes.entity';
import {
  EvidenceCountry,
  StoredDateColumn,
  assertStoredDateColumn,
  storedWallClockToInstant,
  toEvidenceCountry,
} from './evidence-storage-timezones';

const pdfMake = require('pdfmake/build/pdfmake');
const pdfFonts = require('pdfmake/build/vfs_fonts');

pdfMake.vfs = pdfFonts.vfs;

@Injectable()
export class EvidencesService {
  private readonly logger = new Logger(EvidencesService.name);

  private readonly supervisorOverrideEmails = [
    'sst@hadamexico.com',
    'klarios@hadamexico.com',
    'gsalgado@hadamexico.com',
    'auxsistemadegestion@hadainternational.com',
    'glora@hadainternational.com',
    'mruiz@hadamexico.com',
    'arodriguez@hadamexico.com',
    'esanchez@hadamexico.com',
    'cseguridad@hadainternational.com',
    'gsanchez@hadamexico.com',
    'bproyectos@hadamexico.com',
    'eduardo-266@hotmail.com',
    'carrellin@hadamexico.com',
    'mfaneite@hadamexico.com',
    'esolorio@hadamexico.com',
  ];

  private readonly cancelEvidenceEmails = [
    'glora@hadainternational.com',
    'sst@hadamexico.com',
    'dtrujillo@hadamexico.com',
    'gsanchez@hadamexico.com',
    'cseguridad@hadainternational.com',
    'eduardo-266@hotmail.com',
  ];

  private readonly relations = [
    'manufacturingPlant',
    'mainType',
    'secondaryType',
    'zone',
    'zone.area',
    'user',
    'supervisors',
    'responsibles',
    'comments',
    'process',
  ];

  getPermissionsConfig() {
    return {
      supervisorOverrideEmails: this.supervisorOverrideEmails,
      cancelEvidenceEmails: this.cancelEvidenceEmails,
    };
  }

  private canManageEvidence(user: User, evidence: Evidence): boolean {
    return (
      user.role === ROLE_ADMINISTRADOR ||
      this.supervisorOverrideEmails.includes(user.email) ||
      evidence.supervisors.some(
        (supervisor) => Number(supervisor.id) === user.id,
      ) ||
      evidence.responsibles.some(
        (responsible) => Number(responsible.id) === user.id,
      )
    );
  }

  private canCancelEvidence(user: User): boolean {
    return (
      user.role === ROLE_ADMINISTRADOR ||
      this.cancelEvidenceEmails.includes(user.email)
    );
  }

  constructor(
    @InjectRepository(Evidence)
    private readonly evidenceRepository: Repository<Evidence>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @Inject(REQUEST) private readonly request: Request,
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
    private readonly mainTypesService: MainTypesService,
    private readonly secondaryTypesService: SecondaryTypesService,
    private readonly zonesService: ZonesService,
    private readonly processesService: ProcessesService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  private parseDateFilter(
    date: string,
    label: string,
    isEndDate = false,
  ): Date {
    const [day, month, year] = date.split('/').map(Number);
    const parsedDate = new Date(year || 0, (month || 1) - 1, day || 0);

    const hasValidShape =
      !!day &&
      !!month &&
      !!year &&
      parsedDate.getFullYear() === year &&
      parsedDate.getMonth() === month - 1 &&
      parsedDate.getDate() === day;

    if (!hasValidShape || Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException(
        `${label} debe tener el formato DD/MM/YYYY`,
      );
    }

    if (isEndDate) {
      parsedDate.setHours(23, 59, 59, 999);
      return parsedDate;
    }

    parsedDate.setHours(0, 0, 0, 0);
    return parsedDate;
  }

  private buildCreatedAtFilter(startDate?: string, endDate?: string) {
    if (!startDate && !endDate) return undefined;

    const parsedStartDate = startDate
      ? this.parseDateFilter(startDate, 'La fecha de inicio')
      : undefined;

    const parsedEndDate = endDate
      ? this.parseDateFilter(endDate, 'La fecha de fin', true)
      : undefined;

    if (parsedStartDate && parsedEndDate) {
      if (parsedStartDate > parsedEndDate) {
        throw new BadRequestException(
          'La fecha de inicio no puede ser mayor a la fecha de fin',
        );
      }

      return Between(parsedStartDate, parsedEndDate);
    }

    if (parsedStartDate) {
      return Between(parsedStartDate, new Date());
    }

    if (parsedEndDate) {
      return LessThanOrEqual(parsedEndDate);
    }

    return undefined;
  }

  private parseMainTypeIds(mainTypeIds?: string): number[] {
    if (!mainTypeIds) {
      return [];
    }

    return mainTypeIds
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private parseEvidenceIds(ids?: string): number[] {
    if (!ids) {
      return [];
    }

    return ids
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private parseSecondaryTypeIds(secondaryTypeIds?: string): number[] {
    if (!secondaryTypeIds) {
      return [];
    }

    return secondaryTypeIds
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private parseProcessIds(processIds?: string): number[] {
    if (!processIds) {
      return [];
    }

    return processIds
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private parseZoneIds(zoneIds?: string): number[] {
    if (!zoneIds) {
      return [];
    }

    return zoneIds
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private parseAreaIds(areaIds?: string): number[] {
    if (!areaIds) {
      return [];
    }

    return areaIds
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private parseStatuses(statuses?: string): string[] {
    if (!statuses) {
      return [];
    }

    return statuses
      .split(',')
      .map((status) => status.trim())
      .filter((status) => status.length > 0);
  }

  private parseResponsibleIds(responsibleIds?: string): number[] {
    if (!responsibleIds) {
      return [];
    }

    return responsibleIds
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  async create(
    createEvidenceDto: CreateEvidenceDto,
    file: Express.Multer.File,
  ) {
    const { id: userId } = this.request['user'] as User;

    let imgEvidence = '';

    if (file) {
      imgEvidence = file.filename;
    }

    const {
      manufacturingPlantId,
      typeHallazgo,
      type,
      zone,
      supervisor,
      process,
      description,
      priorityDays,
    } = createEvidenceDto;

    const manufacturingPlant =
      await this.manufacturingPlantsService.findOne(manufacturingPlantId);

    const mainType = await this.mainTypesService.findOne(typeHallazgo);

    const secondaryType = await this.secondaryTypesService.findOne(type);

    const zoneRow = await this.zonesService.findOne(zone);

    const processRow = await this.processesService.findOne(process);

    const user = await this.usersService.findOne(userId);

    const supervisors = await this.usersService.findSupervisor({
      manufacturingPlantId,
      zoneId: zone,
      supervisorId: supervisor,
    });

    if (!supervisors.length)
      throw new BadRequestException(
        `No se ha encontrado algun supervisor asignador para la planta ${manufacturingPlant.name}, zona ${zoneRow.name}`,
      );

    const responsibles = await this.usersService.findProcesses({
      manufacturingPlantId,
      processId: process,
      supervisorId: supervisor,
    });

    const colombianIds =
      await this.manufacturingPlantsService.getColombianPlantsIds();

    const createdAt = getColombiaNow(colombianIds, manufacturingPlantId);

    const evidenceCurrent = await this.evidenceRepository.save(
      this.evidenceRepository.create({
        imgEvidence,
        manufacturingPlant,
        mainType,
        secondaryType,
        zone: zoneRow,
        process: processRow,
        user,
        supervisors,
        responsibles,
        status: STATUS_OPEN,
        createdAt,
        updatedAt: createdAt,
        description: description || '',
        priorityDays: priorityDays || null,
      }),
    );

    const typeEmail = 'create';

    if (responsibles.length) {
      this.sendEmailUsers(responsibles, evidenceCurrent, typeEmail);
    }

    this.notifyByEmail({
      manufacturingPlant,
      evidenceCurrent,
      type: typeEmail,
    });

    return 'ok';
  }

  async sendEmailUsers(
    users: User[],
    evidenceCurrent: Evidence,
    type: string,
    extra?: {
      reassignedBy?: User;
      previousResponsibles?: User[];
      currentResponsibles?: User[];
    },
  ) {
    const requestUser = this.request['user'] as User;

    if (process.env.NODE_ENV === ENV_DEVELOPMENT) {
      const mio = await this.usersService.findOne(1);
      users = [mio];
    }

    this.logger.debug(
      `sendEmailUsers: Usuarios a notificar para la planta ${evidenceCurrent.manufacturingPlant.name}: ${users.length}`,
    );

    for (let i = 0, size = users.length; i < size; i++) {
      const userToSendEmail = users[i];

      switch (type) {
        case 'create':
          await this.mailService.sendCreate({
            user: userToSendEmail,
            evidenceCurrent,
          });
          break;
        case 'cancel':
          await this.mailService.sendCancel({
            cancelledBy: requestUser,
            user: userToSendEmail,
            evidenceCurrent,
          });
          break;
        case 'solution':
          await this.mailService.sendSolution({
            user: userToSendEmail,
            evidenceCurrent,
          });
          break;
        case 'reassign':
          await this.mailService.sendReassign({
            user: userToSendEmail,
            reassignedBy: extra?.reassignedBy || requestUser,
            evidenceCurrent,
            previousResponsibles: extra?.previousResponsibles || [],
            currentResponsibles: extra?.currentResponsibles || [],
          });
          break;
      }
    }
  }

  async notifyByEmail({
    manufacturingPlant,
    evidenceCurrent,
    type,
  }: {
    manufacturingPlant: ManufacturingPlant;
    evidenceCurrent: Evidence;
    type: string;
  }) {
    let plantUsers = await this.usersService.findAllByPlant(
      manufacturingPlant.id,
    );

    if (process.env.NODE_ENV === ENV_DEVELOPMENT) {
      const mio = await this.usersService.findOne(1);
      plantUsers = [mio];
    }

    this.logger.debug(
      `notifyByEmail: Usuarios a notificar para la planta ${manufacturingPlant.name}: ${plantUsers.length}`,
    );

    if (!plantUsers.length) {
      throw new BadRequestException(
        `No se ha encontrado usuarios asignados para la planta ${manufacturingPlant.name}`,
      );
    }

    await this.sendEmailUsers(plantUsers, evidenceCurrent, type);
  }

  async saveSolution(
    id: number,
    file: Express.Multer.File,
    descriptionSolution: string,
  ) {
    const evidence = await this.findOne(id);
    const requestUser = this.request['user'] as User;

    if (!this.canManageEvidence(requestUser, evidence)) {
      throw new ForbiddenException(
        'No tiene permisos para cerrar este hallazgo',
      );
    }

    const colombianIds =
      await this.manufacturingPlantsService.getColombianPlantsIds();

    evidence.imgSolution = file?.originalname || '';
    evidence.solutionDate = getColombiaNow(
      colombianIds,
      evidence.manufacturingPlant.id,
    );
    evidence.descriptionSolution = descriptionSolution || '';
    evidence.status = STATUS_CLOSE;
    evidence.updatedAt = evidence.solutionDate;

    const evidenceSolution = await this.evidenceRepository.save(evidence);

    const manufacturingPlant = await this.manufacturingPlantsService.findOne(
      evidenceSolution.manufacturingPlant.id,
    );

    await this.notifyByEmail({
      manufacturingPlant,
      evidenceCurrent: evidenceSolution,
      type: 'solution',
    });

    return evidenceSolution;
  }

  async saveProcessStart(id: number, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'Debe capturar o adjuntar evidencia para iniciar el proceso',
      );
    }

    const evidence = await this.findOne(id);
    const requestUser = this.request['user'] as User;

    if (!this.canManageEvidence(requestUser, evidence)) {
      throw new ForbiddenException(
        'No tiene permisos para iniciar el estatus en progreso',
      );
    }

    if (evidence.imgProcess) {
      throw new BadRequestException(
        'El estatus en progreso ya fue registrado para este hallazgo',
      );
    }

    if (evidence.status !== STATUS_OPEN) {
      throw new BadRequestException(
        'Solo se puede iniciar en progreso cuando el hallazgo esta abierto',
      );
    }

    const colombianIds =
      await this.manufacturingPlantsService.getColombianPlantsIds();

    evidence.imgProcess = file.originalname;
    evidence.startProcessDate = getColombiaNow(
      colombianIds,
      evidence.manufacturingPlant.id,
    );
    evidence.status = STATUS_IN_PROGRESS;
    evidence.updatedAt = evidence.startProcessDate;

    const evidenceUpdated = await this.evidenceRepository.save(evidence);

    await this.mailService.sendInProgress({
      user: evidence.user,
      startedBy: requestUser,
      evidenceCurrent: evidenceUpdated,
    });

    return evidenceUpdated;
  }

  async addComment(id: number, comment: CommentEvidenceDto) {
    const evidence = await this.findOne(id);
    const user = this.request['user'] as User;

    const { comment: commentText } = comment;

    await this.commentRepository.save(
      this.commentRepository.create({
        user,
        comment: commentText,
        evidence,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    await this.evidenceRepository.update(id, {
      updatedAt: new Date(),
    });

    return this.findOne(id);
  }

  /**
   * Fechas tal como están guardadas (texto de la hora de pared, sin pasar por
   * el Date de node-postgres) y el país de la planta de cada hallazgo.
   */
  private async findStoredDates(ids: number[]) {
    const storedDates = new Map<
      number,
      { country: EvidenceCountry } & Record<StoredDateColumn, string | null>
    >();

    if (!ids.length) return storedDates;

    const rows: Array<{
      id: number;
      country: string | null;
      createdAt: string | null;
      solutionDate: string | null;
    }> = await this.evidenceRepository.query(
      `SELECT e.id,
              c.name AS country,
              e."createdAt"::text AS "createdAt",
              e."solutionDate"::text AS "solutionDate"
         FROM evidence e
         JOIN manufacturing_plant mp ON mp.id = e."manufacturingPlantId"
         LEFT JOIN countries c ON c.id = mp."countryId"
        WHERE e.id = ANY($1)`,
      [ids],
    );

    rows.forEach(({ id, country, createdAt, solutionDate }) =>
      storedDates.set(Number(id), {
        country: toEvidenceCountry(country),
        createdAt,
        solutionDate,
      }),
    );

    return storedDates;
  }

  /**
   * Filtros que realmente se aplicaron (los del DTO, con la misma lógica de
   * findAll), con nombres legibles y en el mismo orden y textos de la pantalla.
   */
  private async buildExcelFilters(queryEvidenceDto: QueryEvidenceDto) {
    const {
      id,
      ids,
      manufacturingPlantId,
      mainTypeId,
      mainTypeIds,
      secondaryType,
      secondaryTypeIds,
      area,
      areaIds,
      zone,
      zoneIds,
      process: processId,
      processIds,
      responsible,
      responsibleIds,
      status,
      statuses,
      startDate,
      endDate,
    } = queryEvidenceDto;

    const withSingle = <T>(values: T[], single?: T) =>
      Array.from(new Set(single ? [...values, single] : values));

    const namesByIds = async (
      entity: EntityTarget<{ id: number; name: string }>,
      entityIds: number[],
    ) => {
      if (!entityIds.length) return [];

      const rows = await this.evidenceRepository.manager
        .getRepository(entity)
        .findBy({ id: In(entityIds) });
      const namesById = new Map(rows.map((row) => [Number(row.id), row.name]));

      return entityIds.map(
        (entityId) => namesById.get(entityId) ?? `ID ${entityId}`,
      );
    };

    const plantName = manufacturingPlantId
      ? ((
          await namesByIds(ManufacturingPlant, [Number(manufacturingPlantId)])
        )[0] ?? null)
      : null;

    const rows: Array<{ field: string; values: string[] }> = [
      {
        field: 'ID(s)',
        values: withSingle(this.parseEvidenceIds(ids), id && Number(id)).map(
          String,
        ),
      },
      { field: 'Planta', values: plantName ? [plantName] : [] },
      {
        field: 'Clasificación',
        values: await namesByIds(
          MainType,
          withSingle(
            this.parseMainTypeIds(mainTypeIds),
            mainTypeId && Number(mainTypeId),
          ),
        ),
      },
      {
        field: 'Tipo',
        values: await namesByIds(
          SecondaryType,
          withSingle(
            this.parseSecondaryTypeIds(secondaryTypeIds),
            secondaryType && Number(secondaryType),
          ),
        ),
      },
      {
        field: 'Zonas',
        values: await namesByIds(
          Area,
          withSingle(this.parseAreaIds(areaIds), area && Number(area)),
        ),
      },
      {
        field: 'Lugar',
        values: await namesByIds(
          Zone,
          withSingle(this.parseZoneIds(zoneIds), zone && Number(zone)),
        ),
      },
      {
        field: 'Responsables',
        values: await namesByIds(
          User,
          withSingle(
            this.parseResponsibleIds(responsibleIds),
            responsible && Number(responsible),
          ),
        ),
      },
      {
        field: 'Estatus',
        values: withSingle(this.parseStatuses(statuses), status),
      },
      { field: 'Fecha inicio', values: startDate ? [startDate] : [] },
      { field: 'Fecha fin', values: endDate ? [endDate] : [] },
    ];

    // La pantalla no tiene filtro de proceso, pero el endpoint sí lo aplica:
    // si llega, se documenta al final para no ocultar un filtro aplicado.
    const processFilterIds = withSingle(
      this.parseProcessIds(processIds),
      processId && Number(processId),
    );

    if (processFilterIds.length) {
      rows.push({
        field: 'Proceso',
        values: await namesByIds(Processes, processFilterIds),
      });
    }

    return {
      rows,
      plantName,
      extraFiltersCount: rows.filter(
        ({ field, values }) => field !== 'Planta' && values.length > 0,
      ).length,
    };
  }

  async downloadFile(
    type: string,
    queryEvidenceDto: QueryEvidenceDto,
    res: Response,
  ): Promise<void> {
    const datos = await this.findAll(queryEvidenceDto);

    if (type === 'xlsx') {
      const timeZone = resolveTimeZone(queryEvidenceDto.timeZone);
      const downloadedAt = new Date();
      const offsetMinutes = getOffsetMinutes(downloadedAt, timeZone);
      const offsetLabel = formatUtcOffsetShort(offsetMinutes);
      const downloadedAtWall = toWallClock(downloadedAt, timeZone);

      const workbook = await XlsxPopulate.fromBlankAsync();
      const sheet = workbook.sheet(0);
      sheet.name('Hallazgos');

      const headers = [
        { key: 'id', header: 'ID', isNumber: true },
        { key: 'status', header: 'Estatus' },
        { key: 'isActive', header: 'Activo', isNumber: true },
        { key: 'manufacturingPlant', header: 'Planta', isRelations: true },
        { key: 'mainType', header: 'Evento', isRelations: true },
        { key: 'secondaryType', header: 'Tipo de evento', isRelations: true },
        { key: 'zone', header: 'Lugar', isRelations: true },
        { key: 'user', header: 'Usuario que creó', isRelations: true },
        {
          key: 'createdAt',
          header: `Fecha de creación (${offsetLabel})`,
          isDate: true,
        },
        {
          key: 'solutionDate',
          header: `Fecha de solución (${offsetLabel})`,
          isDate: true,
        },
        { key: 'supervisors', header: 'Supervisores', isMultiRelations: true },
        { key: 'responsibles', header: 'Responsables', isMultiRelations: true },
        { key: 'process', header: 'Proceso', isRelations: true },
      ];

      headers
        .filter(({ isDate }) => isDate)
        .forEach(({ key }) => assertStoredDateColumn(key));

      const storedDates = await this.findStoredDates(datos.map(({ id }) => id));
      const excelFilters = await this.buildExcelFilters(queryEvidenceDto);

      headers.forEach(({ header: key }, i) => {
        sheet
          .cell(1, i + 1)
          .value(key)
          .style({
            //bold: true,
            fill: '71BF44',
            //border: true,
            horizontalAlignment: 'right',
            //color: 'FFFFFF',
          });
      });

      datos.forEach((obj, rowIndex) => {
        headers.forEach(
          (
            {
              key,
              isRelations = false,
              isNumber = false,
              isDate = false,
              isMultiRelations = false,
            },
            colIndex,
          ) => {
            const cell = sheet.cell(rowIndex + 2, colIndex + 1);

            if (isDate) {
              // Se usa el texto guardado (hora de pared), no el Date de node-postgres,
              // para no aplicar dos veces el desfase.
              const stored = storedDates.get(obj.id);
              const storedValue = stored?.[key];

              if (storedValue) {
                const instant = storedWallClockToInstant(
                  key,
                  stored.country,
                  storedValue,
                );

                cell
                  .value(wallClockToExcelSerial(toWallClock(instant, timeZone)))
                  .style({
                    numberFormat: 'yyyy-mm-dd hh:mm:ss',
                    horizontalAlignment: 'right',
                  });
              }

              return;
            }

            let value = obj[key] || '';

            if (isRelations) {
              value = obj[key]?.name || '';
            }

            if (key === 'isActive') {
              value = obj[key] ? 1 : 0;
            }

            if (isMultiRelations) {
              value = obj[key].map((item) => item?.name || '').join(', ');
            }

            cell.value(isNumber ? value : `${value}`).style({
              horizontalAlignment: 'right',
            });
          },
        );
      });

      headers.forEach(({ header }, i) =>
        sheet.column(i + 1).width(Math.max(20, header.length + 4)),
      );

      const user = this.request['user'] as User;
      const filtersSheet = workbook.addSheet('Filtros');
      const filtersRows: Array<[string, string | number]> = [
        ['Campo', 'Valor'],
        ['Descargado por', user?.name || ''],
        [
          'Fecha descarga (local)',
          `${formatWallClock(downloadedAtWall)} (${formatUtcOffsetLong(offsetMinutes)}, ${timeZone})`,
        ],
        [
          'Fecha descarga (UTC)',
          downloadedAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        ],
        ['Total de registros', datos.length],
        ...excelFilters.rows.map(({ field, values }): [string, string] => [
          field,
          values.length ? values.join(', ') : '(todos)',
        ]),
      ];

      filtersRows.forEach(([field, value], i) => {
        filtersSheet
          .cell(i + 1, 1)
          .value(field)
          .style({ bold: true });
        filtersSheet
          .cell(i + 1, 2)
          .value(value)
          .style({ bold: i === 0, horizontalAlignment: 'left' });
      });

      [0, 1].forEach((col) =>
        filtersSheet
          .column(col + 1)
          .width(
            Math.max(...filtersRows.map((row) => String(row[col]).length)) + 2,
          ),
      );

      filtersSheet.freezePanes(0, 1);

      const fileName = `${[
        'Hallazgos',
        excelFilters.plantName
          ? sanitizeFileNamePart(excelFilters.plantName, 'Planta')
          : 'Todas',
        ...(excelFilters.extraFiltersCount > 0
          ? [`+${excelFilters.extraFiltersCount}filtros`]
          : []),
        buildFileNameTimestamp(timeZone, downloadedAt),
      ].join('_')}.xlsx`;

      const buffer = await workbook.outputAsync();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        buildAttachmentContentDisposition(fileName),
      );
      res.send(buffer);
    }

    if (type === 'pdf') {
      const styles: StyleDictionary = {
        header: {
          fontSize: 22,
          bold: true,
          alignment: 'center',
          margin: [0, 60, 0, 20],
        },
        body: {
          alignment: 'justify',
          margin: [0, 0, 0, 70],
        },
        signature: {
          //fontSize: 14,
          bold: true,
          // alignment: 'left',
          background: '#66BB6A',
        },
        footer: {
          fontSize: 10,
          italics: true,
          alignment: 'center',
          margin: [0, 0, 0, 20],
        },
      };

      const headers = [
        'ID',
        'Grupo',
        'Tipo de hallazgo',
        'Lugar',
        'Proceso',
        'Creado por',
        'Estatus',
        'Fecha de creación',
        'Imagen de hallazgo',
        'Imagen de solución',
      ];

      const dataPdf = [];

      const notFoundImage = uploadStaticImage('image-not-found.png');

      for (const evidence of datos) {
        const imgSolution =
          uploadStaticImage(
            evidence.imgSolution ? `/evidences/${evidence.imgSolution}` : '',
          ) || notFoundImage;
        const imgEvidence =
          uploadStaticImage(
            evidence.imgEvidence ? `/evidences/${evidence.imgEvidence}` : '',
          ) || notFoundImage;

        dataPdf.push([
          evidence.id,
          evidence.mainType.name,
          evidence.secondaryType.name,
          evidence.zone.name,
          evidence.process?.name || '',
          evidence.user.name,
          {
            text: evidence.status,
            style: evidence.status === 'Cerrado' ? 'signature' : '',
          },
          stringToDateWithTime(evidence.createdAt),
          {
            image: `data:image/png;base64,${imgEvidence}`,
            width: 50,
            height: 50,
          },
          {
            image: `data:image/png;base64,${imgSolution}`,
            width: 50,
            height: 50,
          },
        ]);
      }

      const docDefinition: TDocumentDefinitions = {
        styles,
        //pageMargins: [40, 110, 40, 60],
        pageOrientation: 'landscape',
        content: [
          {
            layout: 'lightHorizontalLines',
            table: {
              headerRows: 1,
              widths: dataPdf[0].map(() => 'auto'),
              body: [[...headers], ...dataPdf],
            },
          },
        ],
      };

      const pdfDoc = pdfMake.createPdf(docDefinition);

      pdfDoc.getBase64((dataPdf64) => {
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment;filename="Hallazgos.pdf"',
          'Content-Length': Buffer.byteLength(dataPdf64, 'base64'),
        });
        res.end(Buffer.from(dataPdf64, 'base64'));
      });
    }
  }

  async findAll(queryEvidenceDto: QueryEvidenceDto) {
    const { manufacturingPlants } = this.request['user'] as User;

    const {
      id,
      ids,
      manufacturingPlantId,
      mainTypeId,
      mainTypeIds,
      secondaryType,
      secondaryTypeIds,
      area,
      areaIds,
      zone,
      zoneIds,
      process,
      processIds,
      responsible,
      responsibleIds,
      status,
      statuses,
      startDate,
      endDate,
    } = queryEvidenceDto;

    const scopedEvidenceIds = this.parseEvidenceIds(ids);

    if (id) {
      scopedEvidenceIds.push(id);
    }

    const uniqueEvidenceIds = Array.from(new Set(scopedEvidenceIds));

    const scopedMainTypeIds = this.parseMainTypeIds(mainTypeIds);

    if (mainTypeId) {
      scopedMainTypeIds.push(mainTypeId);
    }

    const uniqueMainTypeIds = Array.from(new Set(scopedMainTypeIds));

    const scopedSecondaryTypeIds = this.parseSecondaryTypeIds(secondaryTypeIds);

    if (secondaryType) {
      scopedSecondaryTypeIds.push(secondaryType);
    }

    const uniqueSecondaryTypeIds = Array.from(new Set(scopedSecondaryTypeIds));

    const scopedAreaIds = this.parseAreaIds(areaIds);

    if (area) {
      scopedAreaIds.push(area);
    }

    const uniqueAreaIds = Array.from(new Set(scopedAreaIds));

    const scopedZoneIds = this.parseZoneIds(zoneIds);

    if (zone) {
      scopedZoneIds.push(zone);
    }

    const uniqueZoneIds = Array.from(new Set(scopedZoneIds));

    const scopedProcessIds = this.parseProcessIds(processIds);

    if (process) {
      scopedProcessIds.push(process);
    }

    const uniqueProcessIds = Array.from(new Set(scopedProcessIds));

    const scopedResponsibleIds = this.parseResponsibleIds(responsibleIds);

    if (responsible) {
      scopedResponsibleIds.push(responsible);
    }

    const uniqueResponsibleIds = Array.from(new Set(scopedResponsibleIds));

    const scopedStatuses = this.parseStatuses(statuses);

    if (status) {
      scopedStatuses.push(status);
    }

    const uniqueStatuses = Array.from(new Set(scopedStatuses));

    const manufacturingPlantsIds = manufacturingPlantId
      ? [manufacturingPlantId]
      : manufacturingPlants.map((manufacturingPlant) => manufacturingPlant.id);

    if (!manufacturingPlantsIds.length)
      throw new BadRequestException('No se ha encontrado plantas asignadas');

    const createdAtFilter = this.buildCreatedAtFilter(startDate, endDate);
    const scopedZoneFilter = {
      ...(uniqueZoneIds.length > 0 && { id: In(uniqueZoneIds) }),
      ...(uniqueAreaIds.length > 0 && { area: { id: In(uniqueAreaIds) } }),
    };

    const evidences = await this.evidenceRepository.find({
      where: {
        //isActive: true,
        ...(uniqueEvidenceIds.length > 0 && { id: In(uniqueEvidenceIds) }),
        ...(manufacturingPlantId
          ? {
              manufacturingPlant: { id: manufacturingPlantId, isActive: true },
            }
          : {
              manufacturingPlant: {
                id: In(manufacturingPlantsIds),
                isActive: true,
              },
            }),
        ...(uniqueMainTypeIds.length > 0 && {
          mainType: { id: In(uniqueMainTypeIds) },
        }),
        ...(uniqueSecondaryTypeIds.length > 0 && {
          secondaryType: { id: In(uniqueSecondaryTypeIds) },
        }),
        ...(Object.keys(scopedZoneFilter).length > 0 && {
          zone: scopedZoneFilter,
        }),
        ...(uniqueProcessIds.length > 0 && {
          process: { id: In(uniqueProcessIds) },
        }),
        ...(uniqueResponsibleIds.length > 0 && {
          responsibles: { id: In(uniqueResponsibleIds) },
        }),
        ...(uniqueStatuses.length > 0 && { status: In(uniqueStatuses) }),
        ...(createdAtFilter && { createdAt: createdAtFilter }),
      },
      relations: this.relations,
      order: {
        id: 'DESC',
      },
    });

    return evidences;
  }

  async findAllGraphql(
    paramsArgs: ParamsArgs,
    userId: number,
  ): Promise<{
    data: Evidence[];
    count: number;
  }> {
    const {
      id,
      ids,
      manufacturingPlantId,
      mainTypeId,
      mainTypeIds,
      secondaryTypeId,
      secondaryTypeIds,
      areaId,
      areaIds,
      zoneId,
      zoneIds,
      processId,
      processIds,
      responsibleId,
      responsibleIds,
      limit,
      page,
      status,
      statuses,
      startDate,
      endDate,
    } = paramsArgs;

    const scopedEvidenceIds = ids && ids.length > 0 ? ids : [];

    if (id) {
      scopedEvidenceIds.push(id);
    }

    const uniqueEvidenceIds = Array.from(new Set(scopedEvidenceIds));

    const scopedMainTypeIds =
      mainTypeIds && mainTypeIds.length > 0
        ? mainTypeIds
        : mainTypeId
          ? [mainTypeId]
          : [];

    const scopedSecondaryTypeIds =
      secondaryTypeIds && secondaryTypeIds.length > 0
        ? secondaryTypeIds
        : secondaryTypeId
          ? [secondaryTypeId]
          : [];

    const scopedAreaIds =
      areaIds && areaIds.length > 0 ? areaIds : areaId ? [areaId] : [];

    const scopedZoneIds =
      zoneIds && zoneIds.length > 0 ? zoneIds : zoneId ? [zoneId] : [];

    const scopedProcessIds =
      processIds && processIds.length > 0
        ? processIds
        : processId
          ? [processId]
          : [];

    const scopedResponsibleIds =
      responsibleIds && responsibleIds.length > 0
        ? responsibleIds
        : responsibleId
          ? [responsibleId]
          : [];

    const scopedStatuses =
      statuses && statuses.length > 0 ? statuses : status ? [status] : [];

    const user = await this.usersService.findOne(userId);

    const { manufacturingPlants } = user;

    const manufacturingPlantsIds = manufacturingPlantId
      ? [manufacturingPlantId]
      : manufacturingPlants.map((manufacturingPlant) => manufacturingPlant.id);

    if (!manufacturingPlantsIds.length)
      throw new BadRequestException('No se ha encontrado plantas asignadas');

    const createdAtFilter = this.buildCreatedAtFilter(startDate, endDate);
    const scopedZoneFilter = {
      ...(scopedZoneIds.length > 0 && { id: In(scopedZoneIds) }),
      ...(scopedAreaIds.length > 0 && { area: { id: In(scopedAreaIds) } }),
    };

    const where: FindOptionsWhere<Evidence> = {
      //isActive: true,
      ...(uniqueEvidenceIds.length > 0 && { id: In(uniqueEvidenceIds) }),
      ...(manufacturingPlantId
        ? {
            manufacturingPlant: { id: manufacturingPlantId, isActive: true },
          }
        : {
            manufacturingPlant: {
              id: In(manufacturingPlantsIds),
              isActive: true,
            },
          }),
      ...(scopedMainTypeIds.length > 0 && {
        mainType: { id: In(scopedMainTypeIds) },
      }),
      ...(scopedSecondaryTypeIds.length > 0 && {
        secondaryType: { id: In(scopedSecondaryTypeIds) },
      }),
      ...(Object.keys(scopedZoneFilter).length > 0 && {
        zone: scopedZoneFilter,
      }),
      ...(scopedProcessIds.length > 0 && {
        process: { id: In(scopedProcessIds) },
      }),
      ...(scopedResponsibleIds.length > 0 && {
        responsibles: { id: In(scopedResponsibleIds) },
      }),
      ...(scopedStatuses.length > 0 && { status: In(scopedStatuses) }),
      ...(createdAtFilter && { createdAt: createdAtFilter }),
    };

    const numRows = await this.evidenceRepository.count({
      where,
    });

    const limitNumber = Number(limit);

    const numPerPage = limitNumber;
    // const numPages = Math.ceil(numRows / numPerPage);
    const skip = (Number(page) - 1) * numPerPage;

    const evidences = await this.evidenceRepository.find({
      where,
      ...(limitNumber === -1 ? {} : { take: limitNumber }),
      ...(limitNumber === -1 ? {} : { skip }),
      relations: this.relations,
      order: {
        id: 'DESC',
      },
    });

    return { data: evidences, count: numRows };
  }

  async findOne(id: number) {
    const evidence = await this.evidenceRepository.findOne({
      where: {
        id,
      },
      relations: this.relations,
    });

    if (!evidence)
      throw new NotFoundException(`No se ha encontrado el hallazgo #${id}`);

    return evidence;
  }

  update(id: number, updateEvidenceDto: UpdateEvidenceDto) {
    return { id, updateEvidenceDto };
  }

  async reassignResponsibles(
    id: number,
    reassignResponsiblesDto: ReassignResponsiblesDto,
  ) {
    const requestUser = this.request['user'] as User;
    const evidence = await this.findOne(id);
    const previousResponsibles = evidence.responsibles || [];

    if (!this.canManageEvidence(requestUser, evidence)) {
      throw new ForbiddenException(
        'No tiene permisos para reasignar responsables en este hallazgo',
      );
    }

    const responsibleIds = Array.from(
      new Set(
        (reassignResponsiblesDto.responsibleIds || [])
          .map((responsibleId) => Number(responsibleId))
          .filter(
            (responsibleId) =>
              Number.isInteger(responsibleId) && responsibleId > 0,
          ),
      ),
    );

    let nextResponsibles: User[] = [];

    if (responsibleIds.length > 0) {
      nextResponsibles = await Promise.all(
        responsibleIds.map((responsibleId) =>
          this.usersService.findOne(responsibleId),
        ),
      );

      const invalidResponsibleIds = nextResponsibles
        .filter(
          (responsible) =>
            !responsible.manufacturingPlants.some(
              (manufacturingPlant) =>
                Number(manufacturingPlant.id) ===
                Number(evidence.manufacturingPlant.id),
            ),
        )
        .map((responsible) => responsible.id);

      if (invalidResponsibleIds.length > 0) {
        throw new BadRequestException(
          `Los usuarios ${invalidResponsibleIds.join(', ')} no pertenecen a la planta del hallazgo`,
        );
      }
    }

    evidence.responsibles = nextResponsibles;

    evidence.updatedAt = new Date();

    await this.evidenceRepository.save(evidence);

    const evidenceUpdated = await this.findOne(evidence.id);

    const usersToNotifyMap = new Map<number, User>();

    [...previousResponsibles, ...evidenceUpdated.responsibles].forEach(
      (user) => {
        usersToNotifyMap.set(Number(user.id), user);
      },
    );

    const usersToNotify = Array.from(usersToNotifyMap.values());

    if (usersToNotify.length > 0) {
      await this.sendEmailUsers(usersToNotify, evidenceUpdated, 'reassign', {
        reassignedBy: requestUser,
        previousResponsibles,
        currentResponsibles: evidenceUpdated.responsibles,
      });
    }

    return evidenceUpdated;
  }

  async remove(id: number) {
    const requestUser = this.request['user'] as User;

    if (!this.canCancelEvidence(requestUser)) {
      throw new ForbiddenException(
        'No tiene permisos para cancelar este hallazgo',
      );
    }

    const evidence = await this.findOne(id);
    await this.evidenceRepository.update(id, {
      isActive: false,
      status: STATUS_CANCEL,
      updatedAt: new Date(),
    });

    const manufacturingPlant = await this.manufacturingPlantsService.findOne(
      evidence.manufacturingPlant.id,
    );

    await this.notifyByEmail({
      manufacturingPlant,
      evidenceCurrent: evidence,
      type: 'cancel',
    });

    return evidence;
  }
}
