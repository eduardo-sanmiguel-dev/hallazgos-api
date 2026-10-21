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
  UseGuards,
} from '@nestjs/common';

import {
  CreateGembaWalkZoneDto,
  QueryGembaWalkZoneDto,
  UpdateGembaWalkZoneDto,
} from './dto/index.js';
import { GembaWalkZonesService } from './gemba-walk-zones.service.js';

@Controller('gemba-walk/zones')
export class GembaWalkZonesController {
  constructor(private readonly gembaWalkZonesService: GembaWalkZonesService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createGembaWalkZoneDto: CreateGembaWalkZoneDto) {
    return this.gembaWalkZonesService.create(createGembaWalkZoneDto);
  }

  @Get()
  findAll(@Query() queryGembaWalkZoneDto: QueryGembaWalkZoneDto) {
    return this.gembaWalkZonesService.findAll(queryGembaWalkZoneDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gembaWalkZonesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateGembaWalkZoneDto: UpdateGembaWalkZoneDto,
  ) {
    return this.gembaWalkZonesService.update(+id, updateGembaWalkZoneDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.gembaWalkZonesService.remove(+id);
  }
}
