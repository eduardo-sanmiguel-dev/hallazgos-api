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

import { CreateTypeOfInjuryDto, UpdateTypeOfInjuryDto } from './dto/index.js';
import { TypeOfInjuriesService } from './type-of-injuries.service.js';

@Controller('type-of-injuries')
export class TypeOfInjuriesController {
  constructor(private readonly typeOfInjuriesService: TypeOfInjuriesService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createTypeOfInjuryDto: CreateTypeOfInjuryDto) {
    return this.typeOfInjuriesService.create(createTypeOfInjuryDto);
  }

  @Get()
  findAll() {
    return this.typeOfInjuriesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.typeOfInjuriesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateTypeOfInjuryDto: UpdateTypeOfInjuryDto,
  ) {
    return this.typeOfInjuriesService.update(+id, updateTypeOfInjuryDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.typeOfInjuriesService.remove(+id);
  }
}
