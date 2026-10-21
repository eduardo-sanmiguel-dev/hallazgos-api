import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { AtAgentsController } from './at-agents.controller.js';
import { AtAgentsService } from './at-agents.service.js';
import { AtAgent } from './entities/at-agent.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AtAgent])],
  controllers: [AtAgentsController],
  providers: [AtAgentsService],
  exports: [TypeOrmModule, AtAgentsService],
})
export class AtAgentsModule {}
