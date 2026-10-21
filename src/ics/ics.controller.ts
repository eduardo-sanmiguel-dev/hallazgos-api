import { FileInterceptor } from '@nestjs/platform-express';
import { ImageFileValidationPipe, imageUploadOptions } from '../shared/utils/index.js';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import { CreateIcsDto, FiltersIcsDto, UpdateIcsDto } from './dto/index.js';
import { IcsService } from './ics.service.js';

@Controller('ics')
export class IcsController {
  constructor(private readonly icsService: IcsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('evidence')))
  create(
    @Body() createIcsDto: CreateIcsDto,
    @UploadedFile(ImageFileValidationPipe) file: Express.Multer.File,
  ) {
    return this.icsService.create(createIcsDto, file);
  }

  @Get()
  findAll(@Query() filtersIcsDto: FiltersIcsDto) {
    return this.icsService.findAll(filtersIcsDto);
  }

  @Get('catalogs')
  catalogs() {
    return this.icsService.catalogs();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.icsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateIcsDto: UpdateIcsDto) {
    return this.icsService.update(+id, updateIcsDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.icsService.remove(+id);
  }
}
