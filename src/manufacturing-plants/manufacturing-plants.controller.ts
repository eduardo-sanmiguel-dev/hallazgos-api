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

import { ManufacturingPlantsService } from './manufacturing-plants.service';
import {
  CreateManufacturingPlantDto,
  QueryManufacturingPlantDto,
  UpdateManufacturingPlantDto,
} from './dto';

@Controller('manufacturing-plants')
export class ManufacturingPlantsController {
  constructor(
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createManufacturingPlantDto: CreateManufacturingPlantDto) {
    return this.manufacturingPlantsService.create(createManufacturingPlantDto);
  }

  @Get()
  findAll(@Query() queryManufacturingPlantDto: QueryManufacturingPlantDto) {
    return this.manufacturingPlantsService.findAll(queryManufacturingPlantDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.manufacturingPlantsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateManufacturingPlantDto: UpdateManufacturingPlantDto,
  ) {
    return this.manufacturingPlantsService.update(
      +id,
      updateManufacturingPlantDto,
    );
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.manufacturingPlantsService.remove(+id);
  }
}
