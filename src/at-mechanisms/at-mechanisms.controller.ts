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

import { CreateAtMechanismDto, UpdateAtMechanismDto } from './dto/index.js';
import { AtMechanismsService } from './at-mechanisms.service.js';

@Controller('at-mechanisms')
export class AtMechanismsController {
  constructor(private readonly atMechanismsService: AtMechanismsService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createAtMechanismDto: CreateAtMechanismDto) {
    return this.atMechanismsService.create(createAtMechanismDto);
  }

  @Get()
  findAll() {
    return this.atMechanismsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.atMechanismsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateAtMechanismDto: UpdateAtMechanismDto,
  ) {
    return this.atMechanismsService.update(+id, updateAtMechanismDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.atMechanismsService.remove(+id);
  }
}
