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

import { ProcessesService } from './processes.service.js';
import {
  CreateProcessesDto,
  QueryProcessesDto,
  UpdateProcessesDto,
} from './dto/index.js';

@Controller('Processes')
export class ProcessesController {
  constructor(private readonly processesService: ProcessesService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createProcessesDto: CreateProcessesDto) {
    return this.processesService.create(createProcessesDto);
  }

  @Get()
  findAll(@Query() queryProcessesDto: QueryProcessesDto) {
    return this.processesService.findAll(queryProcessesDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.processesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateProcessesDto: UpdateProcessesDto,
  ) {
    return this.processesService.update(+id, updateProcessesDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.processesService.remove(+id);
  }
}
