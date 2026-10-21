import { PartialType } from '@nestjs/mapped-types';
import { CreateTypeOfInjuryDto } from './create-type-of-injury.dto.js';

export class UpdateTypeOfInjuryDto extends PartialType(CreateTypeOfInjuryDto) {}
