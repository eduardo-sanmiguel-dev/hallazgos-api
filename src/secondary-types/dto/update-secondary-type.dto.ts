import { PartialType } from '@nestjs/mapped-types';
import { CreateSecondaryTypeDto } from './create-secondary-type.dto.js';

export class UpdateSecondaryTypeDto extends PartialType(CreateSecondaryTypeDto) {}
