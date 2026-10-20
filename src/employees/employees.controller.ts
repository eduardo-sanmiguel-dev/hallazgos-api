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

import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  FiltersEmployeeDto,
  UpdateEmployeeDto,
} from './dto';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeesService.create(createEmployeeDto);
  }

  @Post('seed')
  seed() {
    return this.employeesService.seed();
  }

  @Get()
  findAll(@Query() filtersEmployeeDto: FiltersEmployeeDto) {
    return this.employeesService.findAll(filtersEmployeeDto);
  }

  @Get('catalogs')
  findCatalogs() {
    return this.employeesService.findCatalogs();
  }

  @Get('positions')
  findPositions() {
    return this.employeesService.findPositions();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(+id, updateEmployeeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.employeesService.remove(+id);
  }
}
