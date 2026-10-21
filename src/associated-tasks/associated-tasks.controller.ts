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

import { AssociatedTasksService } from './associated-tasks.service.js';
import {
  CreateAssociatedTaskDto,
  FiltersAssociatedTaskDto,
  UpdateAssociatedTaskDto,
} from './dto/index.js';

@Controller('associated-tasks')
export class AssociatedTasksController {
  constructor(
    private readonly associatedTasksService: AssociatedTasksService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createAssociatedTaskDto: CreateAssociatedTaskDto) {
    return this.associatedTasksService.create(createAssociatedTaskDto);
  }

  @Get()
  findAll(@Query() filtersAssociatedTaskDto: FiltersAssociatedTaskDto) {
    return this.associatedTasksService.findAll(filtersAssociatedTaskDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.associatedTasksService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateAssociatedTaskDto: UpdateAssociatedTaskDto,
  ) {
    return this.associatedTasksService.update(+id, updateAssociatedTaskDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.associatedTasksService.remove(+id);
  }
}
