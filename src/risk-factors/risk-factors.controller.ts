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

import { CreateRiskFactorDto, UpdateRiskFactorDto } from './dto/index.js';
import { RiskFactorsService } from './risk-factors.service.js';

@Controller('risk-factors')
export class RiskFactorsController {
  constructor(private readonly riskFactorsService: RiskFactorsService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createRiskFactorDto: CreateRiskFactorDto) {
    return this.riskFactorsService.create(createRiskFactorDto);
  }

  @Get()
  findAll() {
    return this.riskFactorsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.riskFactorsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateRiskFactorDto: UpdateRiskFactorDto,
  ) {
    return this.riskFactorsService.update(+id, updateRiskFactorDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.riskFactorsService.remove(+id);
  }
}
