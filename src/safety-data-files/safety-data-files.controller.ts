import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
  NotFoundException,
} from '@nestjs/common';

import type { Response } from 'express';
import { existsSync } from 'fs';
import { basename, join } from 'path';

import {
  CreateSafetyDataFileDto,
  QuerySafetyDataFileDto,
  UpdateSafetyDataFileDto,
} from './dto';
import { SafetyDataFilesService } from './safety-data-files.service';

@Controller('safety-data-files')
export class SafetyDataFilesController {
  constructor(
    private readonly safetyDataFilesService: SafetyDataFilesService,
  ) {}

  @Post()
  create(@Body() createSafetyDataFileDto: CreateSafetyDataFileDto) {
    return this.safetyDataFilesService.create(createSafetyDataFileDto);
  }

  @Get()
  findAll(@Query() querySafetyDataFileDto: QuerySafetyDataFileDto) {
    return this.safetyDataFilesService.findAll(querySafetyDataFileDto);
  }

  @Get('download')
  async downloadPdf(@Query('name') name: string, @Res() res: Response) {
    // Solo un nombre de archivo simple dentro de la carpeta de HDS: evita
    // rutas como "../../.env" (path traversal).
    const fileName = basename(name ?? '');

    if (!fileName || fileName !== name) {
      throw new NotFoundException('File not found');
    }

    const filePath = join(this.safetyDataFilesService.filePath, fileName);

    if (!existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    res.sendFile(filePath);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.safetyDataFilesService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateSafetyDataFileDto: UpdateSafetyDataFileDto,
  ) {
    return this.safetyDataFilesService.update(+id, updateSafetyDataFileDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.safetyDataFilesService.remove(+id);
  }
}
