import { PartialType } from '@nestjs/mapped-types';
import { CreateNatureOfEventDto } from './create-nature-of-event.dto.js';

export class UpdateNatureOfEventDto extends PartialType(CreateNatureOfEventDto) {}
