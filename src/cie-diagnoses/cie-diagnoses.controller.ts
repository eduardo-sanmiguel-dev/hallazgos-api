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
import { CieDiagnosesService } from './cie-diagnoses.service.js';

import { CreateCieDiagnosisDto, UpdateCieDiagnosisDto } from './dto/index.js';

@Controller('cie-diagnoses')
export class CieDiagnosesController {
  constructor(private readonly cieDiagnosesService: CieDiagnosesService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createCieDiagnosisDto: CreateCieDiagnosisDto) {
    return this.cieDiagnosesService.create(createCieDiagnosisDto);
  }

  @Get()
  findAll() {
    return this.cieDiagnosesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cieDiagnosesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateCieDiagnosisDto: UpdateCieDiagnosisDto,
  ) {
    return this.cieDiagnosesService.update(+id, updateCieDiagnosisDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.cieDiagnosesService.remove(+id);
  }
}
