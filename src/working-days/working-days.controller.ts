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

import { CreateWorkingDayDto, UpdateWorkingDayDto } from './dto/index.js';
import { WorkingDaysService } from './working-days.service.js';

@Controller('working-days')
export class WorkingDaysController {
  constructor(private readonly workingDaysService: WorkingDaysService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createWorkingDayDto: CreateWorkingDayDto) {
    return this.workingDaysService.create(createWorkingDayDto);
  }

  @Get()
  findAll() {
    return this.workingDaysService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workingDaysService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateWorkingDayDto: UpdateWorkingDayDto,
  ) {
    return this.workingDaysService.update(+id, updateWorkingDayDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.workingDaysService.remove(+id);
  }
}
