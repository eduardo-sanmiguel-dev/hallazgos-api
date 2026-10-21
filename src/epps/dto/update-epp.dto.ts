import { PartialType } from '@nestjs/mapped-types';
import { CreateEppDto } from './create-epp.dto.js';

export class UpdateEppDto extends PartialType(CreateEppDto) {}
