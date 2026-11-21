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

import { CreateAreaDto, QueryAreaDto, UpdateAreaDto } from './dto/index.js';
import { AreasService } from './areas.service.js';
import { CacheService } from '../shared/cache/cache.service.js';
import { cachedCatalog } from '../shared/cache/cached-catalog.js';

@Controller('areas')
export class AreasController {
  constructor(
    private readonly areasService: AreasService,
    private readonly cache: CacheService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createAreaDto: CreateAreaDto) {
    return this.areasService.create(createAreaDto);
  }

  @Get()
  findAll(@Query() queryAreaDto: QueryAreaDto) {
    // Igual para todos los usuarios: caché compartido (ver cachedCatalog).
    return cachedCatalog(this.cache, 'areas', queryAreaDto, () =>
      this.areasService.findAll(queryAreaDto),
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.areasService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() updateAreaDto: UpdateAreaDto) {
    return this.areasService.update(+id, updateAreaDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.areasService.remove(+id);
  }
}
