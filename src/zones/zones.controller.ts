import { UseGuards } from '@nestjs/common';
import { AdminGuard } from '@shared/guards/admin.guard';
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

import { ZonesService } from './zones.service';
import { CreateZoneDto, QueryZoneDto, UpdateZoneDto } from './dto';

@Controller('zones')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createZoneDto: CreateZoneDto) {
    return this.zonesService.create(createZoneDto);
  }

  @Get()
  findAll(@Query() queryZoneDto: QueryZoneDto) {
    return this.zonesService.findAll(queryZoneDto);
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
