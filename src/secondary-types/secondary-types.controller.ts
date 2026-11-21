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

import { SecondaryTypesService } from './secondary-types.service.js';
import {
  CreateSecondaryTypeDto,
  QuerySecondaryTypeDto,
  UpdateSecondaryTypeDto,
} from './dto/index.js';
import { CacheService } from '../shared/cache/cache.service.js';
import { cachedCatalog } from '../shared/cache/cached-catalog.js';

@Controller('secondary-types')
export class SecondaryTypesController {
  constructor(
    private readonly secondaryTypesService: SecondaryTypesService,
    private readonly cache: CacheService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createSecondaryTypeDto: CreateSecondaryTypeDto) {
    return this.secondaryTypesService.create(createSecondaryTypeDto);
  }

  @Get()
  findAll(@Query() querySecondaryTypeDto: QuerySecondaryTypeDto) {
    // Igual para todos los usuarios: caché compartido (ver cachedCatalog).
    return cachedCatalog(
      this.cache,
      'secondaryTypes',
      querySecondaryTypeDto,
      () => this.secondaryTypesService.findAll(querySecondaryTypeDto),
    );
  }

  @Get('by/manufacturing-plant/:id')
  findAllByManufacturingPlant(@Param('id') id: string) {
    return this.secondaryTypesService.findAllByManufacturingPlant(+id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.secondaryTypesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateSecondaryTypeDto: UpdateSecondaryTypeDto,
  ) {
    return this.secondaryTypesService.update(+id, updateSecondaryTypeDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.secondaryTypesService.remove(+id);
  }
}
