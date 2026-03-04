import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';

import { CreateConfigEppDto, UpdateConfigEppDto } from './dto';
import { ConfigEppService } from './config-epp.service';

@Controller('config-epp')
export class ConfigEppController {
  constructor(private readonly configEppService: ConfigEppService) {}

  @Post()
  create(@Body() createConfigEppDto: CreateConfigEppDto) {
    return this.configEppService.create(createConfigEppDto);
  }

  @Get()
  findAll() {
    return this.configEppService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.configEppService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateConfigEppDto: UpdateConfigEppDto,
  ) {
    return this.configEppService.update(+id, updateConfigEppDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.configEppService.remove(+id);
  }
}
