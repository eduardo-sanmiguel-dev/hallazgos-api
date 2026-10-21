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

import { CreateTypeOfLinkDto, UpdateTypeOfLinkDto } from './dto';
import { TypeOfLinksService } from './type-of-links.service';

@Controller('type-of-links')
export class TypeOfLinksController {
  constructor(private readonly typeOfLinksService: TypeOfLinksService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createTypeOfLinkDto: CreateTypeOfLinkDto) {
    return this.typeOfLinksService.create(createTypeOfLinkDto);
  }

  @Get()
  findAll() {
    return this.typeOfLinksService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.typeOfLinksService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateTypeOfLinkDto: UpdateTypeOfLinkDto,
  ) {
    return this.typeOfLinksService.update(+id, updateTypeOfLinkDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.typeOfLinksService.remove(+id);
  }
}
