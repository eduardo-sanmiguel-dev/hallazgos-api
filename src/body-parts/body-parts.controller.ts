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

import { CreateBodyPartDto, UpdateBodyPartDto } from './dto/index.js';
import { BodyPartsService } from './body-parts.service.js';

@Controller('body-parts')
export class BodyPartsController {
  constructor(private readonly bodyPartsService: BodyPartsService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createBodyPartDto: CreateBodyPartDto) {
    return this.bodyPartsService.create(createBodyPartDto);
  }

  @Get()
  findAll() {
    return this.bodyPartsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bodyPartsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateBodyPartDto: UpdateBodyPartDto,
  ) {
    return this.bodyPartsService.update(+id, updateBodyPartDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.bodyPartsService.remove(+id);
  }
}
