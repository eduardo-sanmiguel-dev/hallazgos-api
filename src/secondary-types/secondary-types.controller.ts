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
  Query,
} from '@nestjs/common';

import { SecondaryTypesService } from './secondary-types.service';
import {
  CreateSecondaryTypeDto,
  QuerySecondaryTypeDto,
  UpdateSecondaryTypeDto,
} from './dto';

@Controller('secondary-types')
export class SecondaryTypesController {
  constructor(private readonly secondaryTypesService: SecondaryTypesService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createSecondaryTypeDto: CreateSecondaryTypeDto) {
    return this.secondaryTypesService.create(createSecondaryTypeDto);
  }

  @Get()
  findAll(@Query() querySecondaryTypeDto: QuerySecondaryTypeDto) {
    return this.secondaryTypesService.findAll(querySecondaryTypeDto);
  }

  @Get('by/manufacturing-plant/:id')
  findAllByManufacturingPlant(@Param('id') id: string) {
    return this.secondaryTypesService.findAllByManufacturingPlant(+id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.secondaryTypesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateSecondaryTypeDto: UpdateSecondaryTypeDto,
  ) {
    return this.secondaryTypesService.update(+id, updateSecondaryTypeDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.secondaryTypesService.remove(+id);
  }
}
