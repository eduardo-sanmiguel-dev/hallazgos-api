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

import { ZonesService } from './zones.service.js';
import { CreateZoneDto, QueryZoneDto, UpdateZoneDto } from './dto/index.js';
import { CacheService } from '../shared/cache/cache.service.js';
import { cachedCatalog } from '../shared/cache/cached-catalog.js';

@Controller('zones')
export class ZonesController {
  constructor(
    private readonly zonesService: ZonesService,
    private readonly cache: CacheService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createZoneDto: CreateZoneDto) {
    return this.zonesService.create(createZoneDto);
  }

  @Get()
  findAll(@Query() queryZoneDto: QueryZoneDto) {
    // Igual para todos los usuarios: caché compartido (ver cachedCatalog).
    return cachedCatalog(this.cache, 'zones', queryZoneDto, () =>
      this.zonesService.findAll(queryZoneDto),
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.zonesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() updateZoneDto: UpdateZoneDto) {
    return this.zonesService.update(+id, updateZoneDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.zonesService.remove(+id);
  }
}
