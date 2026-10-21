import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { AssociatedTasksController } from './associated-tasks.controller.js';
import { AssociatedTasksService } from './associated-tasks.service.js';
import { AssociatedTask } from './entities/associated-task.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AssociatedTask])],
  controllers: [AssociatedTasksController],
  providers: [AssociatedTasksService],
  exports: [TypeOrmModule, AssociatedTasksService],
})
export class AssociatedTasksModule {}
