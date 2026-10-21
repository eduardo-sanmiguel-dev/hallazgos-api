import { PartialType } from '@nestjs/mapped-types';
import { CreateEvidenceDto } from './create-evidence.dto.js';

export class UpdateEvidenceDto extends PartialType(CreateEvidenceDto) {}
