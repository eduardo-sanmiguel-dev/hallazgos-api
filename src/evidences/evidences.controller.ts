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
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ImageFileValidationPipe,
  imageUploadOptions,
} from '../shared/utils/index.js';

import type { Response } from 'express';

import { EvidencesService } from './evidences.service.js';
import {
  CommentEvidenceDto,
  CreateEvidenceDto,
  QueryEvidenceDto,
  ReassignResponsiblesDto,
  UpdateEvidenceDto,
} from './dto/index.js';

@Controller('evidences')
export class EvidencesController {
  constructor(private readonly evidencesService: EvidencesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('evidence')))
  create(
    @Body() createEvidenceDto: CreateEvidenceDto,
    @UploadedFile(ImageFileValidationPipe) file: Express.Multer.File,
  ) {
    return this.evidencesService.create(createEvidenceDto, file);
  }

  @Post('/solution/:id')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('solution')))
  saveSolution(
    @UploadedFile(ImageFileValidationPipe) file: Express.Multer.File,
    @Param('id') id: string,
    @Body('descriptionSolution') descriptionSolution: string,
  ) {
    return this.evidencesService.saveSolution(+id, file, descriptionSolution);
  }

  @Post('/process/:id')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('process')))
  saveProcessStart(
    @UploadedFile(ImageFileValidationPipe) file: Express.Multer.File,
    @Param('id') id: string,
  ) {
    return this.evidencesService.saveProcessStart(+id, file);
  }

  @Post('/add/comment/:id')
  addComment(@Param('id') id: string, @Body() comment: CommentEvidenceDto) {
    return this.evidencesService.addComment(+id, comment);
  }

  @Get('/permissions/config')
  getPermissionsConfig() {
    return this.evidencesService.getPermissionsConfig();
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
  remove(@Param('id') id: string) {
    return this.evidencesService.remove(+id);
  }
}
