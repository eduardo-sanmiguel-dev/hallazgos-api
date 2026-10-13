import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';

import {
  CreateGembaWalkDto,
  QueryAvailableEventsDto,
  QueryGembaWalkDto,
  QueryWalkCalendarDto,
  StartGembaWalkDto,
} from './dto';
import { GembaWalksService } from './gemba-walks.service';

// Registro de recorridos. Sin edición ni eliminación.
@Controller('gemba-walk/walks')
export class GembaWalksController {
  constructor(private readonly gembaWalksService: GembaWalksService) {}

  @Get('access')
  access() {
    return this.gembaWalksService.access();
  }

  // Solo lectura: no crea, edita ni elimina eventos.
  @Get('calendar')
  findCalendar(@Query() queryWalkCalendarDto: QueryWalkCalendarDto) {
    return this.gembaWalksService.findCalendar(queryWalkCalendarDto);
  }

  @Get('available-events')
  findAvailableEvents(
    @Query() queryAvailableEventsDto: QueryAvailableEventsDto,
  ) {
    return this.gembaWalksService.findAvailableEvents(queryAvailableEventsDto);
  }

  // Valida la tolerancia y devuelve el comprobante con la hora de inicio.
  @Post('start')
  start(@Body() startGembaWalkDto: StartGembaWalkDto) {
    return this.gembaWalksService.start(startGembaWalkDto);
  }

  @Post()
  create(@Body() createGembaWalkDto: CreateGembaWalkDto) {
    return this.gembaWalksService.create(createGembaWalkDto);
  }

  @Get()
  findAll(@Query() queryGembaWalkDto: QueryGembaWalkDto) {
    return this.gembaWalksService.findAll(queryGembaWalkDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gembaWalksService.findOne(+id);
  }
}
