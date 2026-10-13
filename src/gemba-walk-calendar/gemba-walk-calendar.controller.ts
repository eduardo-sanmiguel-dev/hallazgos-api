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
  CreateGembaWalkCalendarDto,
  QueryGembaWalkCalendarDto,
  UpdateGembaWalkCalendarDto,
} from './dto';
import { GembaWalkCalendarService } from './gemba-walk-calendar.service';

@Controller('gemba-walk/calendar')
export class GembaWalkCalendarController {
  constructor(
    private readonly gembaWalkCalendarService: GembaWalkCalendarService,
  ) {}

  // Crea varios eventos a la vez; cada uno se guarda como registro individual.
  @Post()
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
  update(@Body() updateGembaWalkCalendarDto: UpdateGembaWalkCalendarDto) {
    return this.gembaWalkCalendarService.update(updateGembaWalkCalendarDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.gembaWalkCalendarService.remove(+id);
  }
}
