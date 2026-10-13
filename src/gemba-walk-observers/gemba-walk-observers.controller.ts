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
  remove(@Param('id') id: string) {
    return this.gembaWalkObserversService.remove(+id);
  }
}
