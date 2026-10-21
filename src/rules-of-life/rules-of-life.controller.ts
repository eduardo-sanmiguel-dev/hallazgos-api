import { UseGuards } from '@nestjs/common';
import { AdminGuard } from '@shared/guards/admin.guard';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';

import { CreateRulesOfLifeDto, UpdateRulesOfLifeDto } from './dto';
import { RulesOfLifeService } from './rules-of-life.service';

@Controller('rules-of-life')
export class RulesOfLifeController {
  constructor(private readonly rulesOfLifeService: RulesOfLifeService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createRulesOfLifeDto: CreateRulesOfLifeDto) {
    return this.rulesOfLifeService.create(createRulesOfLifeDto);
  }

  @Post('seed')
  @UseGuards(AdminGuard)
  seed() {
    return this.rulesOfLifeService.seed();
  }

  @Get()
  findAll() {
    return this.rulesOfLifeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rulesOfLifeService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateRulesOfLifeDto: UpdateRulesOfLifeDto,
  ) {
    return this.rulesOfLifeService.update(+id, updateRulesOfLifeDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.rulesOfLifeService.remove(+id);
  }
}
