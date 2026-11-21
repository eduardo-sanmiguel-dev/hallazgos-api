import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFile,
  Query,
  Res,
} from '@nestjs/common';
import {
  ImageFileValidationPipe,
  imageUploadOptions,
} from '../shared/utils/index.js';

import type { Response } from 'express';

import { Idempotent } from '../idempotency/idempotency.interceptor.js';

import { EvidencesService } from './evidences.service.js';
import {
  CommentEvidenceDto,
  CreateEvidenceDto,
  QueryEvidenceDto,
  ReassignResponsiblesDto,
  UpdateEvidenceDto,
} from './dto/index.js';
import { withDefaultPage } from '../shared/dto/pagination.decorators.js';
import { TracedFileInterceptor } from '../shared/interceptors/traced-file.interceptor.js';

// Archivo subido como `Express.Multer.File | undefined`: puede faltar y, con
// la unión, los metadatos del decorador emiten Object directo (sin una
// condición sobre el global Express, que no existe en ejecución).
@Controller('evidences')
export class EvidencesController {
  constructor(private readonly evidencesService: EvidencesService) {}

  @Post()
  @Idempotent()
  @UseInterceptors(
    TracedFileInterceptor('file', imageUploadOptions('evidence')),
  )
  create(
    @Body() createEvidenceDto: CreateEvidenceDto,
    @UploadedFile(ImageFileValidationPipe)
    file: Express.Multer.File | undefined,
  ) {
    return this.evidencesService.create(createEvidenceDto, file);
  }

  @Post('/solution/:id')
  @Idempotent()
  @UseInterceptors(
    TracedFileInterceptor('file', imageUploadOptions('solution')),
  )
  saveSolution(
    @UploadedFile(ImageFileValidationPipe)
    file: Express.Multer.File | undefined,
    @Param('id') id: string,
    @Body('descriptionSolution') descriptionSolution: string,
  ) {
    return this.evidencesService.saveSolution(+id, file, descriptionSolution);
  }

  @Post('/process/:id')
  @Idempotent()
  @UseInterceptors(TracedFileInterceptor('file', imageUploadOptions('process')))
  saveProcessStart(
    @UploadedFile(ImageFileValidationPipe)
    file: Express.Multer.File | undefined,
    @Param('id') id: string,
  ) {
    return this.evidencesService.saveProcessStart(+id, file);
  }

  @Post('/add/comment/:id')
  @Idempotent()
  addComment(@Param('id') id: string, @Body() comment: CommentEvidenceDto) {
    return this.evidencesService.addComment(+id, comment);
  }

  // Lista de hallazgos con filtros; con page y limit responde
  // { data, count } (lista de la UI), sin ellos todos.
  @Get()
  findAll(@Query() queryEvidenceDto: QueryEvidenceDto) {
    // Siempre paginado por HTTP (sin page/limit, la primera página).
    // Las descargas usan el listado completo desde el servicio.
    return this.evidencesService.findAll(withDefaultPage(queryEvidenceDto));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.evidencesService.findOne(+id);
  }

  @Get('download/:type')
  async downloadFile(
    @Param('type') type: string,
    @Query() queryEvidenceDto: QueryEvidenceDto,
    @Res() res: Response,
  ) {
    return this.evidencesService.downloadFile(type, queryEvidenceDto, res);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateEvidenceDto: UpdateEvidenceDto,
  ) {
    return this.evidencesService.update(+id, updateEvidenceDto);
  }

  @Patch('reassign/:id')
  @Idempotent()
  reassignResponsibles(
    @Param('id') id: string,
    @Body() reassignResponsiblesDto: ReassignResponsiblesDto,
  ) {
    return this.evidencesService.reassignResponsibles(
      +id,
      reassignResponsiblesDto,
    );
  }

  @Delete(':id')
  @Idempotent()
  remove(@Param('id') id: string) {
    return this.evidencesService.remove(+id);
  }
}
