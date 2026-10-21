import { PartialType } from '@nestjs/mapped-types';
import { CreateTypesOfEventDto } from './create-types-of-event.dto.js';

export class UpdateTypesOfEventDto extends PartialType(CreateTypesOfEventDto) {}
