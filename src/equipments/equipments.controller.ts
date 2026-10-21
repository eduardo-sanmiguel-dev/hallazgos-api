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

import { OptionalUserPlantPipe, UserPlantPipe } from '../shared/pipes/index.js';
import { CreateEquipmentDto, UpdateEquipmentDto } from './dto/index.js';
import { EquipmentsService } from './equipments.service.js';

@Controller('equipments')
export class EquipmentsController {
  constructor(private readonly equipmentsService: EquipmentsService) {}

  @Post()
  create(
    @Body() createEquipmentDto: CreateEquipmentDto,
    @Body('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
  ) {
    return this.equipmentsService.create({
      ...createEquipmentDto,
      manufacturingPlantId,
    });
  }

  @Post('seed')
  seed() {
    return this.equipmentsService.seed();
  }

  @Get()
  findAll(
    // Sin planta: las del usuario. Con planta ajena: 404.
    @Query('manufacturingPlantId', OptionalUserPlantPipe)
    manufacturingPlantId: number | undefined,
    @Query('name') name: string = '',
    // Con page y limit responde paginado ({ data, count }); limit -1 = todos.
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return page && limit
      ? this.equipmentsService.findAllPaginated(
          manufacturingPlantId,
          name,
          page,
          limit,
        )
      : this.equipmentsService.findAll(manufacturingPlantId, name);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.equipmentsService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateEquipmentDto: UpdateEquipmentDto,
    @Body('manufacturingPlantId', OptionalUserPlantPipe)
    manufacturingPlantId: number | undefined,
  ) {
    return this.equipmentsService.update(+id, {
      ...updateEquipmentDto,
      ...(manufacturingPlantId && { manufacturingPlantId }),
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.equipmentsService.remove(+id);
  }
}
