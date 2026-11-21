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

import { ManufacturingPlantsService } from './manufacturing-plants.service.js';
import {
  CreateManufacturingPlantDto,
  QueryManufacturingPlantDto,
  UpdateManufacturingPlantDto,
} from './dto/index.js';
import { CacheService } from '../shared/cache/cache.service.js';
import { cachedCatalog } from '../shared/cache/cached-catalog.js';

@Controller('manufacturing-plants')
export class ManufacturingPlantsController {
  constructor(
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
    private readonly cache: CacheService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createManufacturingPlantDto: CreateManufacturingPlantDto) {
    return this.manufacturingPlantsService.create(createManufacturingPlantDto);
  }

  @Get()
  findAll(@Query() queryManufacturingPlantDto: QueryManufacturingPlantDto) {
    // Igual para todos los usuarios: caché compartido (ver cachedCatalog).
    return cachedCatalog(
      this.cache,
      'manufacturingPlants',
      queryManufacturingPlantDto,
      () => this.manufacturingPlantsService.findAll(queryManufacturingPlantDto),
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.manufacturingPlantsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateManufacturingPlantDto: UpdateManufacturingPlantDto,
  ) {
    return this.manufacturingPlantsService.update(
      +id,
      updateManufacturingPlantDto,
    );
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.manufacturingPlantsService.remove(+id);
  }
}
