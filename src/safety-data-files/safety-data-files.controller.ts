import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import type { Response } from 'express';
import { basename } from 'path';

import { AdminGuard } from '../shared/guards/admin.guard.js';
import { safeFilePath } from '../shared/utils/safe-file-path.js';
import { QuerySafetyDataFileDto } from './dto/index.js';
import { hdsUploadOptions, PdfFileValidationPipe } from './hds-upload.js';
import { SafetyDataFilesService } from './safety-data-files.service.js';

@Controller('safety-data-files')
export class SafetyDataFilesController {
  constructor(
    private readonly safetyDataFilesService: SafetyDataFilesService,
  ) {}

  @Get()
  findAll(@Query() querySafetyDataFileDto: QuerySafetyDataFileDto) {
    return this.safetyDataFilesService.findAll(querySafetyDataFileDto);
  }

  /** Sube una HDS nueva (PDF, campo `file`); el nombre es el del archivo. */
  @Post()
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file', hdsUploadOptions()))
  upload(@UploadedFile(PdfFileValidationPipe) file: Express.Multer.File) {
    return this.safetyDataFilesService.upload(file);
  }

  /** Reemplaza el PDF de una HDS existente. */
  @Put(':id/file')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file', hdsUploadOptions()))
  replace(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile(PdfFileValidationPipe) file: Express.Multer.File,
  ) {
    return this.safetyDataFilesService.replace(id, file);
  }

  @Get('download')
  async downloadPdf(@Query('name') name: string, @Res() res: Response) {
    // Solo un nombre de archivo simple dentro de la carpeta de HDS: evita
    // rutas como "../../.env" (path traversal).
    const fileName = basename(name ?? '');

    if (!fileName || fileName !== name) {
      throw new NotFoundException('Archivo no encontrado.');
    }

    // Solo lo que está en el catálogo (activo), no cualquier archivo suelto.
    const hds = await this.safetyDataFilesService.findActiveByName(fileName);
    const filePath =
      hds && safeFilePath(this.safetyDataFilesService.filePath, fileName);

    if (!filePath) {
      throw new NotFoundException('Archivo no encontrado.');
    }

    res.sendFile(filePath);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.safetyDataFilesService.remove(id);
  }
}
