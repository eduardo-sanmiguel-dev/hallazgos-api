import {
  ImageFileValidationPipe,
  imageUploadOptions,
} from '../shared/utils/index.js';
import { Idempotent } from '../idempotency/idempotency.interceptor.js';
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
import { withDefaultPage } from '../shared/dto/pagination.decorators.js';
import { TracedFileInterceptor } from '../shared/interceptors/traced-file.interceptor.js';

// Archivo subido como `Express.Multer.File | undefined`: puede faltar y, con
// la unión, los metadatos del decorador emiten Object directo (sin una
// condición sobre el global Express, que no existe en ejecución).
@Controller('ics')
export class IcsController {
  constructor(private readonly icsService: IcsService) {}

  @Post()
  @Idempotent()
  @UseInterceptors(
    TracedFileInterceptor('file', imageUploadOptions('evidence')),
  )
  create(
    @Body() createIcsDto: CreateIcsDto,
    @UploadedFile(ImageFileValidationPipe)
    file: Express.Multer.File | undefined,
  ) {
    return this.icsService.create(createIcsDto, file);
  }

  @Get()
  findAll(@Query() filtersIcsDto: FiltersIcsDto) {
    // Siempre paginado por HTTP (sin page/limit, la primera página).
    return this.icsService.findAll(withDefaultPage(filtersIcsDto));
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
