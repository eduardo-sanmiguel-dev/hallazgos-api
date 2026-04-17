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

import { diskStorage } from 'multer';
import { Response } from 'express';

import { EvidencesService } from './evidences.service';
import {
  CommentEvidenceDto,
  CreateEvidenceDto,
  QueryEvidenceDto,
  UpdateEvidenceDto,
} from './dto';

@Controller('evidences')
export class EvidencesController {
  constructor(private readonly evidencesService: EvidencesService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './public/static/images/evidences',
        filename(req, file, callback) {
          req;
          callback(null, file.originalname);
        },
      }),
      limits: {
        fileSize: 2097152, //2 Megabytes
      },
    }),
  )
  create(
    @Body() createEvidenceDto: CreateEvidenceDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.evidencesService.create(createEvidenceDto, file);
  }

  @Post('/solution/:id')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './public/static/images/evidences',
        filename(req, file, callback) {
          req;
          callback(null, file.originalname);
        },
      }),
      limits: {
        fileSize: 2097152, //2 Megabytes
      },
    }),
  )
  saveSolution(
    @UploadedFile() file: Express.Multer.File,
    @Param('id') id: string,
    @Body('descriptionSolution') descriptionSolution: string,
  ) {
    return this.evidencesService.saveSolution(+id, file, descriptionSolution);
  }

  @Post('/process/:id')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './public/static/images/evidences',
        filename(req, file, callback) {
          req;
          callback(null, file.originalname);
        },
      }),
      limits: {
        fileSize: 2097152, //2 Megabytes
      },
    }),
  )
  saveProcessStart(
    @UploadedFile() file: Express.Multer.File,
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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.evidencesService.remove(+id);
  }
}
