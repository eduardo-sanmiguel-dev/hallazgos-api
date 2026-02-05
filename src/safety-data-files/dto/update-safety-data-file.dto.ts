import { PartialType } from '@nestjs/mapped-types';

import { CreateSafetyDataFileDto } from './create-safety-data-file.dto';

export class UpdateSafetyDataFileDto extends PartialType(
  CreateSafetyDataFileDto,
) {}
