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
  CreateGembaWalkCalendarDto,
  QueryGembaWalkCalendarDto,
  UpdateGembaWalkCalendarDto,
} from './dto/index.js';
import { GembaWalkCalendarService } from './gemba-walk-calendar.service.js';

@Controller('gemba-walk/calendar')
export class GembaWalkCalendarController {
  constructor(
    private readonly gembaWalkCalendarService: GembaWalkCalendarService,
  ) {}

  // Crea varios eventos a la vez; cada uno se guarda como registro individual.
  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createGembaWalkCalendarDto: CreateGembaWalkCalendarDto) {
    return this.gembaWalkCalendarService.create(createGembaWalkCalendarDto);
  }

  @Get()
  findAll(@Query() queryGembaWalkCalendarDto: QueryGembaWalkCalendarDto) {
    return this.gembaWalkCalendarService.findAll(queryGembaWalkCalendarDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gembaWalkCalendarService.findOne(+id);
  }

  // Actualiza varios eventos a la vez.
  @Patch()
  @UseGuards(AdminGuard)
  update(@Body() updateGembaWalkCalendarDto: UpdateGembaWalkCalendarDto) {
    return this.gembaWalkCalendarService.update(updateGembaWalkCalendarDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.gembaWalkCalendarService.remove(+id);
  }
}
