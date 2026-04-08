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

import { ExtinguisherInspectionsService } from './extinguisher-inspections.service';
import {
  CreateExtinguisherInspectionDto,
  QueryExtinguisherInspectionDto,
  UpdateExtinguisherInspectionDto,
} from './dto';

@Controller('extinguisher-inspections')
export class ExtinguisherInspectionsController {
  constructor(
    private readonly extinguisherInspectionsService: ExtinguisherInspectionsService,
  ) {}

  @Post()
  create(
    @Body() createExtinguisherInspectionDto: CreateExtinguisherInspectionDto,
  ) {
    return this.extinguisherInspectionsService.create(
      createExtinguisherInspectionDto,
    );
  }

  @Get()
  findAll(
    @Query() queryExtinguisherInspectionDto: QueryExtinguisherInspectionDto,
  ) {
    return this.extinguisherInspectionsService.findAll(
      queryExtinguisherInspectionDto,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.extinguisherInspectionsService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateExtinguisherInspectionDto: UpdateExtinguisherInspectionDto,
  ) {
    return this.extinguisherInspectionsService.update(
      +id,
      updateExtinguisherInspectionDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.extinguisherInspectionsService.remove(+id);
  }
}
