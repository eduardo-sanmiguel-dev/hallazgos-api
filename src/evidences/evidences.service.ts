import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RequestContextService } from '../shared/services/request-context.service.js';

import {
  Between,
  type EntityTarget,
  type FindManyOptions,
  In,
  LessThanOrEqual,
  Repository,
} from 'typeorm';
import type {
  StyleDictionary,
  TDocumentDefinitions,
} from 'pdfmake/interfaces.js';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { createRequire } from 'module';
import { dirname, resolve, sep } from 'path';

import { ManufacturingPlantsService } from '../manufacturing-plants/manufacturing-plants.service.js';
import { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { SecondaryTypesService } from '../secondary-types/secondary-types.service.js';
import {
  ENV_DEVELOPMENT,
  ROLE_ADMINISTRADOR,
  ROLE_SUPERVISOR,
  STATUS_CANCEL,
  STATUS_CLOSE,
  STATUS_IN_PROGRESS,
  STATUS_OPEN,
} from '../shared/constants/index.js';
import { MainTypesService } from '../main-types/main-types.service.js';
import { ProcessesService } from '../processes/processes.service.js';
import { Evidence } from './entities/evidence.entity.js';
import { Comment } from './entities/comments.entity.js';
import { ZonesService } from '../zones/zones.service.js';
import { UsersService } from '../users/users.service.js';
import { User } from '../users/entities/user.entity.js';
import { MailService } from '../mail/mail.service.js';
import {
  CommentEvidenceDto,
  CreateEvidenceDto,
  QueryEvidenceDto,
  ReassignResponsiblesDto,
  UpdateEvidenceDto,
} from './dto/index.js';
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
  scopePlantIds,
  findPaginated,
} from '../shared/utils/index.js';
import { MainType } from '../main-types/entities/main-type.entity.js';
import { SecondaryType } from '../secondary-types/entities/secondary-type.entity.js';
import { Area } from '../areas/entities/area.entity.js';
import { Zone } from '../zones/entities/zone.entity.js';
import { Processes } from '../processes/entities/processes.entity.js';
import {
  assertStoredDateColumn,
  storedWallClockToInstant,
  toEvidenceCountry,
} from './evidence-storage-timezones.js';
import {
  canCancelEvidences,
  hasSupervisorOverride,
} from './evidence-permissions.js';

// pdfmake es CommonJS y su fuente se resuelve como archivo del paquete.
const require = createRequire(import.meta.url);
const pdfMake = require('pdfmake');
const pdfFonts = require('pdfmake/fonts/Roboto');

const PDF_FONTS_DIR = dirname(require.resolve('pdfmake/fonts/Roboto'));

pdfMake.setFonts(pdfFonts);
// Desde pdfmake 0.3 el servidor puede leer archivos locales y descargar URLs.
// El reporte solo usa imágenes data: y las fuentes del paquete: se bloquea lo
// demás, como hacía el build de navegador de 0.2 (y evita sus avisos).
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy((path: string) =>
  resolve(path).startsWith(PDF_FONTS_DIR + sep),
);

export const MISSING_EVIDENCE_MESSAGE =
  'Debe capturar o adjuntar una imagen como evidencia del hallazgo';

// Excel de hallazgos: período máximo por descarga y formato de las fechas.
export const EXPORT_MAX_MONTHS = 12;
const EXCEL_DATE_FORMAT = 'yyyy-mm-dd hh:mm:ss';

/** Fila del Excel tal como la devuelve la consulta (nombres ya resueltos). */
interface ExcelEvidenceRow {
  id: number;
  status: string;
  isActive: boolean;
  manufacturingPlant: string | null;
  mainType: string | null;
  secondaryType: string | null;
  zone: string | null;
  user: string | null;
  process: string | null;
  country: string | null;
  createdAt: string | null;
  solutionDate: string | null;
  supervisors: string | null;
  responsibles: string | null;
}

// Relaciones a muchos del hallazgo: findOne las carga en consultas separadas.
const EVIDENCE_COLLECTIONS = [
  'supervisors',
  'responsibles',
  'comments',
] as const;

// Tipo de correo, para el log de errores de envío.
const EMAIL_TYPE_LABELS: Record<string, string> = {
  create: 'creación',
  'in-progress': 'en progreso',
  solution: 'solución',
  cancel: 'cancelación',
  reassign: 'reasignación',
};

@Injectable()
export class EvidencesService {
  private readonly logger = new Logger(EvidencesService.name);

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
    'startedBy',
    'closedBy',
    'reassignedBy',
  ];

  /** Supervisor o responsable del hallazgo (con cualquier rol). */
  private isAssigned(user: User, evidence: Evidence): boolean {
    return [...evidence.supervisors, ...evidence.responsibles].some(
      (assigned) => Number(assigned.id) === Number(user.id),
    );
  }

  /** Asignado al hallazgo y con rol Supervisor. */
  private isAssignedSupervisor(user: User, evidence: Evidence): boolean {
    return user.role === ROLE_SUPERVISOR && this.isAssigned(user, evidence);
  }

  // Las reglas de quién puede iniciar, cerrar y reasignar son las mismas que
  // aplica el menú de acciones del UI (TableEvidences).

  private canStartProcess(user: User, evidence: Evidence): boolean {
    return (
      user.role === ROLE_ADMINISTRADOR ||
      hasSupervisorOverride(user) ||
      this.isAssignedSupervisor(user, evidence)
    );
  }

  /** El administrador no cierra (salvo que su correo esté en la lista especial). */
  private canCloseEvidence(user: User, evidence: Evidence): boolean {
    return (
      hasSupervisorOverride(user) || this.isAssignedSupervisor(user, evidence)
    );
  }

  private canReassignEvidence(user: User, evidence: Evidence): boolean {
    return (
      user.role === ROLE_ADMINISTRADOR ||
      hasSupervisorOverride(user) ||
      this.isAssigned(user, evidence)
    );
  }

  private canCancelEvidence(user: User): boolean {
    return canCancelEvidences(user);
  }

  /**
   * Cerrado y Cancelado son estados finales. Fuera de los estados permitidos
   * la acción responde 409.
   */
  private assertStatus(evidence: Evidence, allowed: string[], action: string) {
    if (!allowed.includes(evidence.status)) {
      throw new ConflictException(
        `No se puede ${action} el hallazgo #${evidence.id} porque está en estado "${evidence.status}"`,
      );
    }
  }

  /**
   * Cambia el estado solo si el hallazgo sigue en uno de los permitidos (en la
   * misma sentencia UPDATE). Si otra petición lo cambió entre la lectura y la
   * escritura (p. ej. dos cierres a la vez), responde 409 y no envía correos.
   */
  private async transition(
    evidence: Evidence,
    allowed: string[],
    action: string,
    changes: Partial<Evidence>,
    repository: Repository<Evidence>,
  ): Promise<Evidence> {
    this.assertStatus(evidence, allowed, action);

    const { affected } = await repository.update(
      { id: evidence.id, status: In(allowed) },
      changes,
    );

    if (!affected) {
      throw new ConflictException(
        `No se puede ${action} el hallazgo #${evidence.id} porque su estado cambió; recargue e intente de nuevo`,
      );
    }

    return Object.assign(evidence, changes);
  }

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Evidence)
    private readonly evidenceRepository: Repository<Evidence>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly requestContext: RequestContextService,
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
    if (typeof date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(date))
      throw new BadRequestException(
        `${label} debe tener el formato DD/MM/YYYY`,
      );
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

  private transactionalMail<T>(
    work: (repository: Repository<Evidence>) => Promise<T>,
  ): Promise<T> {
    return this.evidenceRepository.manager.transaction((manager) =>
      this.mailService.withOutbox(manager, () =>
        work(manager.getRepository(Evidence)),
      ),
    );
  }

  create(dto: CreateEvidenceDto, file: Express.Multer.File) {
    return this.transactionalMail((repository) =>
      this.createWithMail(dto, file, repository),
    );
  }
  saveSolution(id: number, file: Express.Multer.File, description: string) {
    return this.transactionalMail((repository) =>
      this.solutionWithMail(id, file, description, repository),
    );
  }
  saveProcessStart(id: number, file: Express.Multer.File) {
    return this.transactionalMail((repository) =>
      this.processWithMail(id, file, repository),
    );
  }
  reassignResponsibles(id: number, dto: ReassignResponsiblesDto) {
    return this.transactionalMail((repository) =>
      this.reassignWithMail(id, dto, repository),
    );
  }
  remove(id: number) {
    return this.transactionalMail((repository) =>
      this.cancelWithMail(id, repository),
    );
  }

  private async createWithMail(
    createEvidenceDto: CreateEvidenceDto,
    file: Express.Multer.File,
    repository: Repository<Evidence>,
  ) {
    const userId = this.requestContext.userId;

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

    // Solo en una planta del usuario; una ajena responde 404 (como si no
    // existiera), antes de consultar o guardar nada.
    if (
      !scopePlantIds(
        this.requestContext.user.manufacturingPlants,
        manufacturingPlantId,
      ).length
    ) {
      throw new NotFoundException(
        `Planta #${manufacturingPlantId} no encontrada`,
      );
    }

    const manufacturingPlant =
      await this.manufacturingPlantsService.findOne(manufacturingPlantId);

    const mainType = await this.mainTypesService.findOne(typeHallazgo);

    // La foto es obligatoria según la clasificación (bandera del catálogo).
    if (!file && mainType.requiresEvidence) {
      throw new BadRequestException(MISSING_EVIDENCE_MESSAGE);
    }

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

    const evidenceCurrent = await repository.save(
      repository.create({
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

    // Persistir las notificaciones en la misma transacción, sin esperar SMTP.
    if (responsibles.length) {
      await this.sendEmailUsers(responsibles, evidenceCurrent, typeEmail);
    }

    await this.notifyByEmail({
      manufacturingPlant,
      evidenceCurrent,
      type: typeEmail,
    });

    // Antes respondía el texto "ok". El id deja que la UI diga qué hallazgo
    // quedó guardado, también cuando un reintento ya se había procesado.
    return { id: evidenceCurrent.id };
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
    const requestUser = this.requestContext.user;

    if (this.configService.get<string>('environment') === ENV_DEVELOPMENT) {
      try {
        users = [await this.usersService.findOne(1)];
      } catch (error) {
        if (this.mailService.capturingMail) throw error;
        this.logEmailError(
          type,
          evidenceCurrent,
          'la cuenta de desarrollo',
          error,
        );
        return;
      }
    }

    this.logger.debug(
      `sendEmailUsers: Usuarios a notificar para la planta ${evidenceCurrent.manufacturingPlant.name}: ${users.length}`,
    );

    // Nunca lanza: un correo fallido se registra y no detiene a los demás ni
    // afecta la operación (el cambio ya se guardó).
    for (let i = 0, size = users.length; i < size; i++) {
      const userToSendEmail = users[i];

      try {
        await this.sendEmailByType(
          type,
          userToSendEmail,
          evidenceCurrent,
          requestUser,
          extra,
        );
      } catch (error) {
        if (this.mailService.capturingMail) throw error;
        this.logEmailError(
          type,
          evidenceCurrent,
          `el usuario ${userToSendEmail?.id}`,
          error,
        );
      }
    }
  }

  // Sin comillas: la alerta de OpenObserve manda este texto a Telegram, que
  // las mostraría escapadas (\"…\").
  private logEmailError(
    type: string,
    evidence: Evidence,
    recipient: string,
    error: unknown,
  ) {
    this.logger.error(
      `No se pudo enviar el correo de ${EMAIL_TYPE_LABELS[type] ?? type} del hallazgo #${evidence.id} a ${recipient}: ${(error as Error)?.message ?? error}`,
    );
  }

  private async sendEmailByType(
    type: string,
    userToSendEmail: User,
    evidenceCurrent: Evidence,
    requestUser: User,
    extra?: {
      reassignedBy?: User;
      previousResponsibles?: User[];
      currentResponsibles?: User[];
    },
  ) {
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

  async notifyByEmail({
    manufacturingPlant,
    evidenceCurrent,
    type,
  }: {
    manufacturingPlant: ManufacturingPlant;
    evidenceCurrent: Evidence;
    type: string;
  }) {
    // Nunca lanza: el cambio ya se guardó y un problema al avisar solo se
    // registra en el log.
    const notifyCreator = type === 'solution' && manufacturingPlant.id !== 3;
    let plantUsers: User[];
    try {
      // La planta 3 conserva su lista de destinatarios. En las demás,
      // el cierre se notifica únicamente a quien creó el hallazgo.
      plantUsers = notifyCreator
        ? evidenceCurrent.user?.email
          ? [evidenceCurrent.user]
          : []
        : await this.usersService.findAllByPlant(manufacturingPlant.id);

      if (this.configService.get<string>('environment') === ENV_DEVELOPMENT) {
        plantUsers = [await this.usersService.findOne(1)];
      }
    } catch (error) {
      if (this.mailService.capturingMail) throw error;
      this.logEmailError(
        type,
        evidenceCurrent,
        `los usuarios de la planta ${manufacturingPlant.name}`,
        error,
      );
      return;
    }

    this.logger.debug(
      `notifyByEmail: Usuarios a notificar para la planta ${manufacturingPlant.name}: ${plantUsers.length}`,
    );

    if (!plantUsers.length) {
      this.logger.warn(
        notifyCreator
          ? `No se ha encontrado el creador con correo del hallazgo #${evidenceCurrent.id}: no se envió el correo de solución`
          : `No se ha encontrado usuarios asignados para la planta ${manufacturingPlant.name}: no se envió el correo "${type}" del hallazgo #${evidenceCurrent.id}`,
      );
      return;
    }

    await this.sendEmailUsers(plantUsers, evidenceCurrent, type);
  }

  private async solutionWithMail(
    id: number,
    file: Express.Multer.File,
    descriptionSolution: string,
    repository: Repository<Evidence>,
  ) {
    const evidence = await this.findOne(id, repository);
    const requestUser = this.requestContext.user;

    if (!this.canCloseEvidence(requestUser, evidence)) {
      throw new ForbiddenException(
        'No tiene permisos para cerrar este hallazgo',
      );
    }

    // Misma regla que al crear: la clasificación decide si la foto es obligatoria.
    if (!file && evidence.mainType.requiresEvidence) {
      throw new BadRequestException(MISSING_EVIDENCE_MESSAGE);
    }

    const colombianIds =
      await this.manufacturingPlantsService.getColombianPlantsIds();
    const solutionDate = getColombiaNow(
      colombianIds,
      evidence.manufacturingPlant.id,
    );

    // Antes de guardar: después del cambio de estado nada debe fallar (un
    // reintento con la misma clave de idempotencia no sabría si se guardó).
    const manufacturingPlant = await this.manufacturingPlantsService.findOne(
      evidence.manufacturingPlant.id,
    );

    const evidenceSolution = await this.transition(
      evidence,
      [STATUS_OPEN, STATUS_IN_PROGRESS],
      'cerrar',
      {
        imgSolution: file?.filename || '',
        solutionDate,
        descriptionSolution: descriptionSolution || '',
        status: STATUS_CLOSE,
        updatedAt: solutionDate,
        // Quién lo cerró (antes no se registraba).
        closedBy: { id: requestUser.id, name: requestUser.name } as User,
      },
      repository,
    );

    // Registrar notificaciones antes del commit; SMTP lo ejecuta el worker.
    await this.notifyByEmail({
      manufacturingPlant,
      evidenceCurrent: evidenceSolution,
      type: 'solution',
    });

    return evidenceSolution;
  }

  private async processWithMail(
    id: number,
    file: Express.Multer.File,
    repository: Repository<Evidence>,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Debe capturar o adjuntar evidencia para iniciar el proceso',
      );
    }

    const evidence = await this.findOne(id, repository);
    const requestUser = this.requestContext.user;

    if (!this.canStartProcess(requestUser, evidence)) {
      throw new ForbiddenException(
        'No tiene permisos para iniciar el estatus en progreso',
      );
    }

    this.assertStatus(evidence, [STATUS_OPEN], 'iniciar en progreso');

    if (evidence.imgProcess) {
      throw new ConflictException(
        'El estatus en progreso ya fue registrado para este hallazgo',
      );
    }

    const colombianIds =
      await this.manufacturingPlantsService.getColombianPlantsIds();
    const startProcessDate = getColombiaNow(
      colombianIds,
      evidence.manufacturingPlant.id,
    );

    const evidenceUpdated = await this.transition(
      evidence,
      [STATUS_OPEN],
      'iniciar en progreso',
      {
        imgProcess: file.filename,
        startProcessDate,
        status: STATUS_IN_PROGRESS,
        updatedAt: startProcessDate,
        // Quién lo inició (antes no se registraba).
        startedBy: { id: requestUser.id, name: requestUser.name } as User,
      },
      repository,
    );

    // Persistir antes del commit; el worker realizara el envio SMTP.
    await this.notifyInProgressByEmail(
      evidence.user,
      requestUser,
      evidenceUpdated,
    );

    return evidenceUpdated;
  }

  private async notifyInProgressByEmail(
    user: User,
    startedBy: User,
    evidenceCurrent: Evidence,
  ) {
    try {
      await this.mailService.sendInProgress({
        user,
        startedBy,
        evidenceCurrent,
      });
    } catch (error) {
      if (this.mailService.capturingMail) throw error;
      this.logEmailError(
        'in-progress',
        evidenceCurrent,
        `el usuario ${user?.id}`,
        error,
      );
    }
  }

  async addComment(id: number, comment: CommentEvidenceDto) {
    const evidence = await this.findOne(id);
    const user = this.requestContext.user;

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
  /**
   * Filtros que realmente se aplicaron (los del DTO, con la misma lógica de
   * findAll), con nombres legibles y en el mismo orden y textos de la pantalla.
   */
  /**
   * Nombre de las descargas de hallazgos (Excel y PDF):
   * Hallazgos_<Planta|Todas>[_+Nfiltros]_AAAA-MM-DD_HHmm_UTC±HH.<extensión>
   */
  private downloadFileName(
    {
      plantName,
      extraFiltersCount,
    }: { plantName?: string | null; extraFiltersCount: number },
    timeZone: string,
    downloadedAt: Date,
    extension: 'xlsx' | 'pdf',
  ) {
    return `${[
      'Hallazgos',
      plantName ? sanitizeFileNamePart(plantName, 'Planta') : 'Todas',
      ...(extraFiltersCount > 0 ? [`+${extraFiltersCount}filtros`] : []),
      buildFileNameTimestamp(timeZone, downloadedAt),
    ].join('_')}.${extension}`;
  }

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

  /**
   * Excel de hallazgos. Se escribe en streaming hacia la respuesta (exceljs):
   * el archivo empieza a llegar mientras se arma y no se guarda completo en
   * memoria. Antes xlsx-populate lo armaba entero y se llevaba ~2.6 s.
   * Las consultas van primero: un error ahí todavía responde 4xx/5xx normal.
   */
  private async downloadExcel(
    queryEvidenceDto: QueryEvidenceDto,
    res: Response,
  ): Promise<void> {
    this.assertExportPeriod(queryEvidenceDto);

    const timeZone = resolveTimeZone(queryEvidenceDto.timeZone);
    const downloadedAt = new Date();
    const offsetMinutes = getOffsetMinutes(downloadedAt, timeZone);
    const offsetLabel = formatUtcOffsetShort(offsetMinutes);
    const downloadedAtWall = toWallClock(downloadedAt, timeZone);

    const headers: Array<{
      key: keyof ExcelEvidenceRow;
      header: string;
      isDate?: boolean;
    }> = [
      { key: 'id', header: 'ID' },
      { key: 'status', header: 'Estatus' },
      { key: 'isActive', header: 'Activo' },
      { key: 'manufacturingPlant', header: 'Planta' },
      { key: 'mainType', header: 'Evento' },
      { key: 'secondaryType', header: 'Tipo de evento' },
      { key: 'zone', header: 'Lugar' },
      { key: 'user', header: 'Usuario que creó' },
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
      { key: 'supervisors', header: 'Supervisores' },
      { key: 'responsibles', header: 'Responsables' },
      { key: 'process', header: 'Proceso' },
    ];
    headers
      .filter(({ isDate }) => isDate)
      .forEach(({ key }) => assertStoredDateColumn(key));

    const rows = await this.findForExcel(queryEvidenceDto);
    const excelFilters = await this.buildExcelFilters(queryEvidenceDto);

    const cellValue = (
      row: ExcelEvidenceRow,
      key: keyof ExcelEvidenceRow,
      isDate?: boolean,
    ) => {
      if (isDate) {
        // Hora de pared guardada: evita convertir dos veces la zona del driver.
        const stored = row[key] as string | null;
        if (!stored) return null;
        assertStoredDateColumn(key);
        const instant = storedWallClockToInstant(
          key,
          toEvidenceCountry(row.country),
          stored,
        );
        return wallClockToExcelSerial(toWallClock(instant, timeZone));
      }
      if (key === 'id') return Number(row.id);
      if (key === 'isActive') return row.isActive ? 1 : 0;
      return `${row[key] ?? ''}`;
    };

    const user = this.requestContext.user;
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
      ['Total de registros', rows.length],
      ...excelFilters.rows.map(({ field, values }): [string, string] => [
        field,
        values.length ? values.join(', ') : '(todos)',
      ]),
    ];

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      buildAttachmentContentDisposition(
        this.downloadFileName(excelFilters, timeZone, downloadedAt, 'xlsx'),
      ),
    );

    // Si el cliente se desconecta, commit() esperaría para siempre el fin de
    // la respuesta: se corta en cuanto la respuesta se cierra o falla.
    const interrupted = new Promise<never>((_, reject) => {
      res.once('error', reject);
      res.once('close', () => {
        if (!res.writableFinished)
          reject(new Error('la conexión se cerró antes de terminar'));
      });
    });
    interrupted.catch(() => undefined);

    try {
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: res,
        useStyles: true,
        useSharedStrings: true,
      });

      const sheet = workbook.addWorksheet('Hallazgos');
      sheet.columns = headers.map(({ header }) => ({
        width: Math.max(20, header.length + 4),
      }));
      const headerRow = sheet.addRow(headers.map(({ header }) => header));
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF71BF44' },
        };
        cell.alignment = { horizontal: 'right' };
      });
      headerRow.commit();

      for (const row of rows) {
        const excelRow = sheet.addRow(
          headers.map(({ key, isDate }) => cellValue(row, key, isDate)),
        );
        excelRow.alignment = { horizontal: 'right' };
        headers.forEach(({ isDate }, index) => {
          if (isDate) excelRow.getCell(index + 1).numFmt = EXCEL_DATE_FORMAT;
        });
        excelRow.commit();
      }
      sheet.commit();

      const filtersSheet = workbook.addWorksheet('Filtros', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      filtersSheet.columns = [0, 1].map((col) => ({
        width:
          Math.max(...filtersRows.map((row) => String(row[col]).length)) + 2,
      }));
      filtersRows.forEach(([field, value], index) => {
        const excelRow = filtersSheet.addRow([field, value]);
        excelRow.getCell(1).font = { bold: true };
        excelRow.getCell(2).font = { bold: index === 0 };
        excelRow.getCell(2).alignment = { horizontal: 'left' };
        excelRow.commit();
      });
      filtersSheet.commit();

      await Promise.race([workbook.commit(), interrupted]);
    } catch (error) {
      // Los encabezados ya salieron: no se puede responder un error JSON.
      this.logger.error(
        `No se pudo generar el Excel de hallazgos: ${(error as Error).message}`,
      );
      res.destroy(error as Error);
    }
  }

  async downloadFile(
    type: string,
    queryEvidenceDto: QueryEvidenceDto,
    res: Response,
  ): Promise<void> {
    // Antes un tipo desconocido no respondía nada y la petición quedaba
    // colgada hasta el timeout.
    if (!['xlsx', 'pdf'].includes(type)) {
      throw new BadRequestException(
        `Tipo de archivo no soportado: ${type}. Use xlsx o pdf`,
      );
    }

    // Siempre todos los que cumplen los filtros (sin paginar).
    const exportQuery = {
      ...queryEvidenceDto,
      page: undefined,
      limit: undefined,
    };
    if (type === 'xlsx') return this.downloadExcel(exportQuery, res);

    const datos = (await this.findAll(exportQuery)) as Evidence[];

    if (type === 'pdf') {
      // Mismo nombre que el Excel (planta, filtros extra y hora local).
      const timeZone = resolveTimeZone(queryEvidenceDto.timeZone);
      const fileName = this.downloadFileName(
        await this.buildExcelFilters(queryEvidenceDto),
        timeZone,
        new Date(),
        'pdf',
      );

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

      // Ruta relativa a public/static/images: con "/" al inicio,
      // safeFilePath la rechaza como absoluta y todas las fotos salían como
      // "imagen no encontrada".
      for (const evidence of datos) {
        const imgSolution =
          uploadStaticImage(
            evidence.imgSolution ? `evidences/${evidence.imgSolution}` : '',
          ) || notFoundImage;
        const imgEvidence =
          uploadStaticImage(
            evidence.imgEvidence ? `evidences/${evidence.imgEvidence}` : '',
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
              // Por columnas del encabezado: sin resultados, dataPdf[0] no
              // existe (antes respondía 500).
              widths: headers.map(() => 'auto'),
              body: [[...headers], ...dataPdf],
            },
          },
        ],
      };

      const pdf: Buffer = await pdfMake.createPdf(docDefinition).getBuffer();

      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': buildAttachmentContentDisposition(fileName),
        'Content-Length': pdf.length,
      });
      res.end(pdf);
    }
  }

  private buildFindOptions(
    queryEvidenceDto: QueryEvidenceDto,
  ): FindManyOptions<Evidence> | null {
    const { manufacturingPlants } = this.requestContext.user;

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

    const manufacturingPlantsIds = scopePlantIds(
      manufacturingPlants,
      manufacturingPlantId,
    );

    // Sin plantas propias o pidiendo una planta ajena: sin resultados.
    if (!manufacturingPlantsIds.length) {
      return null;
    }

    const createdAtFilter = this.buildCreatedAtFilter(startDate, endDate);
    const scopedZoneFilter = {
      ...(uniqueZoneIds.length > 0 && { id: In(uniqueZoneIds) }),
      ...(uniqueAreaIds.length > 0 && { area: { id: In(uniqueAreaIds) } }),
    };

    const options: FindManyOptions<Evidence> = {
      where: {
        //isActive: true,
        ...(uniqueEvidenceIds.length > 0 && { id: In(uniqueEvidenceIds) }),
        manufacturingPlant: {
          id: In(manufacturingPlantsIds),
          isActive: true,
        },
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
    };

    return options;
  }

  /**
   * Filas del Excel. Los filtros y permisos son los de la lista
   * (buildFindOptions) y de ahí solo salen los IDs; los datos se traen en una
   * sola consulta, sin hidratar entidades: antes eran 3 consultas y el
   * armado de entidades de TypeORM se llevaba cerca de 1 s.
   */
  private async findForExcel(
    queryEvidenceDto: QueryEvidenceDto,
  ): Promise<ExcelEvidenceRow[]> {
    const options = this.buildFindOptions(queryEvidenceDto);
    if (!options) return [];

    const authorized = await this.evidenceRepository.find({
      ...options,
      loadEagerRelations: false,
      relations: [],
      select: { id: true },
    });
    if (!authorized.length) return [];

    // Al filtrar por responsables, la columna muestra solo esos (como la lista).
    const responsibleIds = this.parseResponsibleIds(
      queryEvidenceDto.responsibleIds,
    );
    if (queryEvidenceDto.responsible)
      responsibleIds.push(Number(queryEvidenceDto.responsible));

    // Los arrays evitan crear un parámetro SQL por cada hallazgo exportado.
    return this.evidenceRepository.query(
      `SELECT e.id,
              e.status,
              e."isActive",
              mp.name AS "manufacturingPlant",
              mt.name AS "mainType",
              st.name AS "secondaryType",
              z.name AS zone,
              u.name AS "user",
              pr.name AS process,
              c.name AS country,
              e."createdAt"::text AS "createdAt",
              e."solutionDate"::text AS "solutionDate",
              (SELECT string_agg(su.name, ', ' ORDER BY su.id)
                 FROM evidence_supervisors_user link
                 JOIN "user" su ON su.id = link."userId"
                WHERE link."evidenceId" = e.id) AS supervisors,
              (SELECT string_agg(ru.name, ', ' ORDER BY ru.id)
                 FROM evidence_responsibles_user link
                 JOIN "user" ru ON ru.id = link."userId"
                WHERE link."evidenceId" = e.id
                  AND ($2::int[] IS NULL OR ru.id = ANY($2))) AS responsibles
         FROM evidence e
         JOIN manufacturing_plant mp ON mp.id = e."manufacturingPlantId"
         LEFT JOIN countries c ON c.id = mp."countryId"
         LEFT JOIN main_type mt ON mt.id = e."mainTypeId"
         LEFT JOIN secondary_type st ON st.id = e."secondaryTypeId"
         LEFT JOIN zones z ON z.id = e."zoneId"
         LEFT JOIN "user" u ON u.id = e."userId"
         LEFT JOIN processes pr ON pr.id = e."processId"
        WHERE e.id = ANY($1)
        ORDER BY e.id DESC`,
      [
        authorized.map(({ id }) => id),
        responsibleIds.length ? responsibleIds : null,
      ],
    );
  }

  /**
   * Excel: período obligatorio de hasta EXPORT_MAX_MONTHS meses. Acota el
   * volumen de cada descarga; la UI propone los últimos 90 días.
   */
  private assertExportPeriod({ startDate, endDate }: QueryEvidenceDto) {
    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Seleccione el período a exportar: fecha de inicio y fecha de fin',
      );
    }
    const start = this.parseDateFilter(startDate, 'La fecha de inicio');
    const end = this.parseDateFilter(endDate, 'La fecha de fin', true);
    if (start > end) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser mayor a la fecha de fin',
      );
    }
    const limit = new Date(start);
    limit.setMonth(limit.getMonth() + EXPORT_MAX_MONTHS);
    if (end >= limit) {
      throw new BadRequestException(
        `El período a exportar no puede superar ${EXPORT_MAX_MONTHS} meses`,
      );
    }
  }

  async findAll(queryEvidenceDto: QueryEvidenceDto) {
    const { page, limit } = queryEvidenceDto;
    const paginated = !!page && !!limit;
    const options = this.buildFindOptions(queryEvidenceDto);
    if (!options) return paginated ? { data: [], count: 0 } : [];

    // Con página y límite, la lista de hallazgos ({ data, count }); sin
    // ellos, todos (descargas de Excel y PDF).
    return paginated
      ? findPaginated(this.evidenceRepository, options, page, limit)
      : this.evidenceRepository.find(options);
  }

  /**
   * Hallazgo visible para el usuario en sesión: solo de sus plantas. Uno de
   * otra planta responde el mismo 404 que uno inexistente (no revela que
   * existe). Lo usan ver, comentar, iniciar, cerrar, reasignar y cancelar.
   */
  async findOne(id: number, repository = this.evidenceRepository) {
    const plantIds = this.requestContext.manufacturingPlantIds;

    // Las colecciones van aparte: en un solo JOIN serían supervisores ×
    // responsables × comentarios filas (un hallazgo con 42 responsables tardaba
    // 305 ms en esa consulta). Una tras otra, nunca en paralelo: puede correr
    // dentro de una transacción (misma conexión).
    const evidence = plantIds.length
      ? await repository.findOne({
          where: {
            id,
            manufacturingPlant: { id: In(plantIds) },
          },
          relations: this.relations.filter(
            (relation) => !EVIDENCE_COLLECTIONS.includes(relation as never),
          ),
        })
      : null;

    if (!evidence)
      throw new NotFoundException(`No se ha encontrado el hallazgo #${id}`);

    for (const relation of EVIDENCE_COLLECTIONS) {
      const row = await repository.findOne({
        where: { id },
        relations: [relation],
      });
      Object.assign(evidence, { [relation]: row?.[relation] ?? [] });
    }

    return evidence;
  }

  update(id: number, updateEvidenceDto: UpdateEvidenceDto) {
    return { id, updateEvidenceDto };
  }

  private async reassignWithMail(
    id: number,
    reassignResponsiblesDto: ReassignResponsiblesDto,
    repository: Repository<Evidence>,
  ) {
    const requestUser = this.requestContext.user;
    const evidence = await this.findOne(id, repository);
    const previousResponsibles = evidence.responsibles || [];

    if (!this.canReassignEvidence(requestUser, evidence)) {
      throw new ForbiddenException(
        'No tiene permisos para reasignar responsables en este hallazgo',
      );
    }

    this.assertStatus(evidence, [STATUS_OPEN, STATUS_IN_PROGRESS], 'reasignar');

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

    // Hora local de la planta, como startProcessDate.
    const colombianIds =
      await this.manufacturingPlantsService.getColombianPlantsIds();
    const reassignedAt = getColombiaNow(
      colombianIds,
      evidence.manufacturingPlant.id,
    );

    {
      const current = await repository.findOne({
        where: { id: evidence.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) throw new NotFoundException('Hallazgo no encontrado');
      this.assertStatus(
        current,
        [STATUS_OPEN, STATUS_IN_PROGRESS],
        'reasignar',
      );
      if (
        current.status !== evidence.status ||
        current.updatedAt.getTime() !== evidence.updatedAt.getTime()
      ) {
        throw new ConflictException(
          'El hallazgo cambió; recargue e intente de nuevo',
        );
      }
      await repository.save({
        id: evidence.id,
        responsibles: nextResponsibles,
        updatedAt: new Date(),
        // Quién hizo esta reasignación (antes no se registraba).
        reassignedBy: { id: requestUser.id } as User,
        reassignedAt,
      });
    }

    const evidenceUpdated = await this.findOne(evidence.id, repository);

    const usersToNotifyMap = new Map<number, User>();

    [...previousResponsibles, ...evidenceUpdated.responsibles].forEach(
      (user) => {
        usersToNotifyMap.set(Number(user.id), user);
      },
    );

    const usersToNotify = Array.from(usersToNotifyMap.values());

    // Registrar la notificación dentro de la transacción de reasignación.
    if (usersToNotify.length > 0) {
      await this.sendEmailUsers(usersToNotify, evidenceUpdated, 'reassign', {
        reassignedBy: requestUser,
        previousResponsibles,
        currentResponsibles: evidenceUpdated.responsibles,
      });
    }

    return evidenceUpdated;
  }

  private async cancelWithMail(id: number, repository: Repository<Evidence>) {
    const requestUser = this.requestContext.user;

    if (!this.canCancelEvidence(requestUser)) {
      throw new ForbiddenException(
        'No tiene permisos para cancelar este hallazgo',
      );
    }

    const current = await this.findOne(id, repository);

    // Antes de guardar, igual que al cerrar: después del cambio de estado
    // nada debe fallar.
    const manufacturingPlant = await this.manufacturingPlantsService.findOne(
      current.manufacturingPlant.id,
    );

    const evidence = await this.transition(
      current,
      [STATUS_OPEN, STATUS_IN_PROGRESS],
      'cancelar',
      { isActive: false, status: STATUS_CANCEL, updatedAt: new Date() },
      repository,
    );

    // Persistir un correo por destinatario antes del commit.
    await this.notifyByEmail({
      manufacturingPlant,
      evidenceCurrent: evidence,
      type: 'cancel',
    });

    return evidence;
  }
}
