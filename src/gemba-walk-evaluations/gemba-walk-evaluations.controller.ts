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
  CreateGembaWalkEvaluationDto,
  QueryGembaWalkEvaluationDto,
  UpdateGembaWalkEvaluationDto,
} from './dto';
import { GembaWalkEvaluationsService } from './gemba-walk-evaluations.service';
import { GEMBA_WALK_EVALUATION_CATEGORIES } from './gemba-walk-evaluation-categories';

@Controller('gemba-walk/evaluations')
export class GembaWalkEvaluationsController {
  constructor(
    private readonly gembaWalkEvaluationsService: GembaWalkEvaluationsService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createGembaWalkEvaluationDto: CreateGembaWalkEvaluationDto) {
    return this.gembaWalkEvaluationsService.create(
      createGembaWalkEvaluationDto,
    );
  }

  @Get()
  findAll(@Query() queryGembaWalkEvaluationDto: QueryGembaWalkEvaluationDto) {
    return this.gembaWalkEvaluationsService.findAll(
      queryGembaWalkEvaluationDto,
    );
  }

  @Get('categories')
  findCategories() {
    return GEMBA_WALK_EVALUATION_CATEGORIES;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gembaWalkEvaluationsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateGembaWalkEvaluationDto: UpdateGembaWalkEvaluationDto,
  ) {
    return this.gembaWalkEvaluationsService.update(
      +id,
      updateGembaWalkEvaluationDto,
    );
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.gembaWalkEvaluationsService.remove(+id);
  }
}
