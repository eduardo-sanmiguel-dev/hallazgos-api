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

import { AccidentPositionsService } from './accident-positions.service.js';
import {
  CreateAccidentPositionDto,
  FiltersAccidentPositionDto,
  UpdateAccidentPositionDto,
} from './dto/index.js';

@Controller('accident-positions')
export class AccidentPositionsController {
  constructor(
    private readonly accidentPositionsService: AccidentPositionsService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createAccidentPositionDto: CreateAccidentPositionDto) {
    return this.accidentPositionsService.create(createAccidentPositionDto);
  }

  @Get()
  findAll(@Query() filtersAccidentPositionDto: FiltersAccidentPositionDto) {
    return this.accidentPositionsService.findAll(filtersAccidentPositionDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accidentPositionsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateAccidentPositionDto: UpdateAccidentPositionDto,
  ) {
    return this.accidentPositionsService.update(+id, updateAccidentPositionDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.accidentPositionsService.remove(+id);
  }
}
