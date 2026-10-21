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

import { CreateNatureOfEventDto, UpdateNatureOfEventDto } from './dto/index.js';
import { NatureOfEventsService } from './nature-of-events.service.js';

@Controller('nature-of-events')
export class NatureOfEventsController {
  constructor(private readonly natureOfEventsService: NatureOfEventsService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createNatureOfEventDto: CreateNatureOfEventDto) {
    return this.natureOfEventsService.create(createNatureOfEventDto);
  }

  @Get()
  findAll() {
    return this.natureOfEventsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.natureOfEventsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateNatureOfEventDto: UpdateNatureOfEventDto,
  ) {
    return this.natureOfEventsService.update(+id, updateNatureOfEventDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.natureOfEventsService.remove(+id);
  }
}
