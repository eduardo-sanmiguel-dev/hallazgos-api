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

import {
  CreateMachineDto,
  FiltersMachineDto,
  UpdateMachineDto,
} from './dto/index.js';
import { MachinesService } from './machines.service.js';

@Controller('machines')
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createMachineDto: CreateMachineDto) {
    return this.machinesService.create(createMachineDto);
  }

  @Get()
  findAll(@Query() filtersMachineDto: FiltersMachineDto) {
    return this.machinesService.findAll(filtersMachineDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.machinesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() updateMachineDto: UpdateMachineDto) {
    return this.machinesService.update(+id, updateMachineDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.machinesService.remove(+id);
  }
}
