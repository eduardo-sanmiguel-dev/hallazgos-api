import { PartialType } from '@nestjs/mapped-types';
import { CreateMainTypeDto } from './create-main-type.dto.js';

export class UpdateMainTypeDto extends PartialType(CreateMainTypeDto) {}
