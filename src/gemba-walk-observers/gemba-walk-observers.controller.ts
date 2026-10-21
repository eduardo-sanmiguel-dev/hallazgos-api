import { AdminGuard } from '../shared/guards/admin.guard';

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

import {
  CreateGembaWalkObserverDto,
  QueryGembaWalkObserverDto,
  UpdateGembaWalkObserverDto,
} from './dto';
import { GembaWalkObserversService } from './gemba-walk-observers.service';

@Controller('gemba-walk/observers')
export class GembaWalkObserversController {
  constructor(
    private readonly gembaWalkObserversService: GembaWalkObserversService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createGembaWalkObserverDto: CreateGembaWalkObserverDto) {
    return this.gembaWalkObserversService.create(createGembaWalkObserverDto);
  }

  @Get()
  findAll(@Query() queryGembaWalkObserverDto: QueryGembaWalkObserverDto) {
    return this.gembaWalkObserversService.findAll(queryGembaWalkObserverDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gembaWalkObserversService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateGembaWalkObserverDto: UpdateGembaWalkObserverDto,
  ) {
    return this.gembaWalkObserversService.update(
      +id,
      updateGembaWalkObserverDto,
    );
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.gembaWalkObserversService.remove(+id);
  }
}
