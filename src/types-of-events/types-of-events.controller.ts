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
} from '@nestjs/common';

import { CreateTypesOfEventDto, UpdateTypesOfEventDto } from './dto/index.js';
import { TypesOfEventsService } from './types-of-events.service.js';

@Controller('types-of-events')
export class TypesOfEventsController {
  constructor(private readonly typesOfEventsService: TypesOfEventsService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createTypesOfEventDto: CreateTypesOfEventDto) {
    return this.typesOfEventsService.create(createTypesOfEventDto);
  }

  @Get()
  findAll() {
    return this.typesOfEventsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.typesOfEventsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateTypesOfEventDto: UpdateTypesOfEventDto,
  ) {
    return this.typesOfEventsService.update(+id, updateTypesOfEventDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.typesOfEventsService.remove(+id);
  }
}
