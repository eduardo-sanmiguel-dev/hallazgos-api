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

import { Response } from 'express';
import { existsSync } from 'fs';

import { CreateSafetyDataFileDto, UpdateSafetyDataFileDto } from './dto';
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
  findAll(@Query('name') name: string) {
    return this.safetyDataFilesService.findAll(name);
  }

  @Get('download')
  async downloadPdf(@Query('name') name: string, @Res() res: Response) {
    const filePath = this.safetyDataFilesService.filePath + `/${name}`;

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
