import { PartialType } from '@nestjs/mapped-types';
import { CreateRiskFactorDto } from './create-risk-factor.dto.js';

export class UpdateRiskFactorDto extends PartialType(CreateRiskFactorDto) {}
