import { PartialType } from '@nestjs/mapped-types';
import { CreateBodyPartDto } from './create-body-part.dto.js';

export class UpdateBodyPartDto extends PartialType(CreateBodyPartDto) {}
