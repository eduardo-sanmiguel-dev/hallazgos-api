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

import {
  CreateGembaWalkZoneDto,
  QueryGembaWalkZoneDto,
  UpdateGembaWalkZoneDto,
} from './dto';
import { GembaWalkZonesService } from './gemba-walk-zones.service';

@Controller('gemba-walk/zones')
export class GembaWalkZonesController {
  constructor(private readonly gembaWalkZonesService: GembaWalkZonesService) {}

  @Post()
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
  update(
    @Param('id') id: string,
    @Body() updateGembaWalkZoneDto: UpdateGembaWalkZoneDto,
  ) {
    return this.gembaWalkZonesService.update(+id, updateGembaWalkZoneDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.gembaWalkZonesService.remove(+id);
  }
}
