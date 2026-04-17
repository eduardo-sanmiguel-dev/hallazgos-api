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
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  Repository,
} from 'typeorm';
import { StyleDictionary, TDocumentDefinitions } from 'pdfmake/interfaces';
import * as XlsxPopulate from 'xlsx-populate';
import { Request, Response } from 'express';

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
  UpdateEvidenceDto,
} from './dto';
import {
  uploadStaticImage,
  stringToDateWithTime,
  getColombiaNow,
} from '@shared/utils';

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

  async sendEmailUsers(users: User[], evidenceCurrent: Evidence, type: string) {
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

    return this.evidenceRepository.save(evidence);
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

  async downloadFile(
    type: string,
    queryEvidenceDto: QueryEvidenceDto,
    res: Response,
  ): Promise<void> {
    const datos = await this.findAll(queryEvidenceDto);

    if (type === 'xlsx') {
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
        { key: 'user', header: 'Usuario que creo', isRelations: true },
        { key: 'createdAt', header: 'Fecha de creacion', isDate: true },
        { key: 'solutionDate', header: 'Fecha de solución', isDate: true },
        { key: 'supervisors', header: 'Supervisores', isMultiRelations: true },
        { key: 'responsibles', header: 'Responsables', isMultiRelations: true },
        { key: 'process', header: 'Proceso', isRelations: true },
      ];

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

      function formatearFecha(fecha = new Date()) {
        const pad = (n) => n.toString().padStart(2, '0');

        const año = fecha.getFullYear();
        const mes = pad(fecha.getMonth() + 1); // getMonth() es 0-indexado
        const día = pad(fecha.getDate());
        const hora = pad(fecha.getHours());
        const minutos = pad(fecha.getMinutes());
        const segundos = pad(fecha.getSeconds());

        return `${año}-${mes}-${día} ${hora}:${minutos}:${segundos}`;
      }

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
            let value = obj[key] || '';

            if (isRelations) {
              value = obj[key]?.name || '';
            }

            if (key === 'isActive') {
              value = obj[key] ? 1 : 0;
            }

            if (isDate && value) {
              value = formatearFecha(value);
            }

            if (isMultiRelations) {
              value = obj[key].map((item) => item?.name || '').join(', ');
            }

            //console.log(obj);

            sheet
              .cell(rowIndex + 2, colIndex + 1)
              .value(isNumber ? value : `${value}`)
              .style({
                horizontalAlignment: 'right',
              });
          },
        );
      });

      headers.forEach((_, i) => sheet.column(i + 1).width(20));

      const buffer = await workbook.outputAsync();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=Hallazgos.xlsx',
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
      manufacturingPlantId,
      mainTypeId,
      secondaryType,
      zone,
      status,
      startDate,
      endDate,
    } = queryEvidenceDto;

    const manufacturingPlantsIds = manufacturingPlantId
      ? [manufacturingPlantId]
      : manufacturingPlants.map((manufacturingPlant) => manufacturingPlant.id);

    if (!manufacturingPlantsIds.length)
      throw new BadRequestException('No se ha encontrado plantas asignadas');

    const createdAtFilter = this.buildCreatedAtFilter(startDate, endDate);

    const evidences = await this.evidenceRepository.find({
      where: {
        //isActive: true,
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
        ...(mainTypeId && { mainType: { id: mainTypeId } }),
        ...(secondaryType && { secondaryType: { id: secondaryType } }),
        ...(zone && { zone: { id: zone } }),
        ...(status && { status }),
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
      manufacturingPlantId,
      mainTypeId,
      secondaryTypeId,
      zoneId,
      processId,
      limit,
      page,
      status,
      startDate,
      endDate,
    } = paramsArgs;

    const user = await this.usersService.findOne(userId);

    const { manufacturingPlants } = user;

    const manufacturingPlantsIds = manufacturingPlantId
      ? [manufacturingPlantId]
      : manufacturingPlants.map((manufacturingPlant) => manufacturingPlant.id);

    if (!manufacturingPlantsIds.length)
      throw new BadRequestException('No se ha encontrado plantas asignadas');

    const createdAtFilter = this.buildCreatedAtFilter(startDate, endDate);

    const where: FindOptionsWhere<Evidence> = {
      //isActive: true,
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
      ...(mainTypeId && { mainType: { id: mainTypeId } }),
      ...(secondaryTypeId && { secondaryType: { id: secondaryTypeId } }),
      ...(zoneId && { zone: { id: zoneId } }),
      ...(processId && { process: { id: processId } }),
      ...(status && { status }),
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
