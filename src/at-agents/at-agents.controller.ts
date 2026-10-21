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

import { CreateAtAgentDto, UpdateAtAgentDto } from './dto/index.js';
import { AtAgentsService } from './at-agents.service.js';

@Controller('at-agents')
export class AtAgentsController {
  constructor(private readonly atAgentsService: AtAgentsService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createAtAgentDto: CreateAtAgentDto) {
    return this.atAgentsService.create(createAtAgentDto);
  }

  @Get()
  findAll() {
    return this.atAgentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.atAgentsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() updateAtAgentDto: UpdateAtAgentDto) {
    return this.atAgentsService.update(+id, updateAtAgentDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.atAgentsService.remove(+id);
  }
}
