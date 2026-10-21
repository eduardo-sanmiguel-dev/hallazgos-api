import { PartialType } from '@nestjs/mapped-types';
import { CreateAtMechanismDto } from './create-at-mechanism.dto.js';

export class UpdateAtMechanismDto extends PartialType(CreateAtMechanismDto) {}
