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

import { CreateEquipmentDto, UpdateEquipmentDto } from './dto';
import { EquipmentsService } from './equipments.service';

@Controller('equipments')
export class EquipmentsController {
  constructor(private readonly equipmentsService: EquipmentsService) {}

  @Post()
  create(@Body() createEquipmentDto: CreateEquipmentDto) {
    return this.equipmentsService.create(createEquipmentDto);
  }

  @Post('seed')
  seed() {
    return this.equipmentsService.seed();
  }

  @Get()
  findAll(
    @Query('manufacturingPlantId') manufacturingPlantId: string = '0',
    @Query('name') name: string = '',
    // Con page y limit responde paginado ({ data, count }); limit -1 = todos.
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return page && limit
      ? this.equipmentsService.findAllPaginated(
          +manufacturingPlantId,
          name,
          page,
          limit,
        )
      : this.equipmentsService.findAll(+manufacturingPlantId, name);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.equipmentsService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateEquipmentDto: UpdateEquipmentDto,
  ) {
    return this.equipmentsService.update(+id, updateEquipmentDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.equipmentsService.remove(+id);
  }
}
