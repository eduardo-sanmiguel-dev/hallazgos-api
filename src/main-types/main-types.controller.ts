import { UseGuards } from '@nestjs/common';
import { AdminGuard } from '../shared/guards/admin.guard.js';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';

import { MainTypesService } from './main-types.service.js';
import {
  CreateMainTypeDto,
  QueryMainTypeDto,
  UpdateMainTypeDto,
} from './dto/index.js';
import { CacheService } from '../shared/cache/cache.service.js';
import { cachedCatalog } from '../shared/cache/cached-catalog.js';

@Controller('main-types')
export class MainTypesController {
  constructor(
    private readonly mainTypesService: MainTypesService,
    private readonly cache: CacheService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createMainTypeDto: CreateMainTypeDto) {
    return this.mainTypesService.create(createMainTypeDto);
  }

  @Get()
  findAll(@Query() queryMainTypeDto: QueryMainTypeDto) {
    // Igual para todos los usuarios: caché compartido (ver cachedCatalog).
    return cachedCatalog(this.cache, 'mainTypes', queryMainTypeDto, () =>
      this.mainTypesService.findAll(queryMainTypeDto),
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.mainTypesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateMainTypeDto: UpdateMainTypeDto,
  ) {
    return this.mainTypesService.update(+id, updateMainTypeDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.mainTypesService.remove(+id);
  }
}
