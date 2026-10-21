import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkingDayDto } from './create-working-day.dto.js';

export class UpdateWorkingDayDto extends PartialType(CreateWorkingDayDto) {}
