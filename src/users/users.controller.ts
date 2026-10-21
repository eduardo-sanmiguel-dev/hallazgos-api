import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AdminGuard } from '../shared/guards/admin.guard.js';

import { UsersService } from './users.service.js';
import { CreateUserDto, QueryUserDto, UpdateUserDto } from './dto/index.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createUserDto: CreateUserDto) {
    this.usersService.assertPlantsForRequest(
      createUserDto.manufacturingPlantNames,
    );
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll(@Query() queryUserDto: QueryUserDto) {
    return this.usersService.findAllForRequest(queryUserDto);
  }

  @Get('/get-information-current-user')
  getInformationCurrentUser() {
    return this.usersService.getInformationCurrentUser();
  }

  @Get('/supervisors')
  getSupervisors() {
    return this.usersService.getSupervisors();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOneForRequest(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    await this.usersService.findOneForRequest(+id);
    this.usersService.assertPlantsForRequest(
      updateUserDto.manufacturingPlantNames,
    );
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  async remove(@Param('id') id: string) {
    await this.usersService.findOneForRequest(+id);
    return this.usersService.remove(+id);
  }
}
