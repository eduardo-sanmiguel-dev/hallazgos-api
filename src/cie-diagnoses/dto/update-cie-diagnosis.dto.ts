import { PartialType } from '@nestjs/mapped-types';
import { CreateCieDiagnosisDto } from './create-cie-diagnosis.dto.js';

export class UpdateCieDiagnosisDto extends PartialType(CreateCieDiagnosisDto) {}
