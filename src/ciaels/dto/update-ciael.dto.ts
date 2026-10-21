import { PartialType } from '@nestjs/mapped-types';
import { CreateCiaelDto } from './create-ciael.dto.js';

export class UpdateCiaelDto extends PartialType(CreateCiaelDto) {}
