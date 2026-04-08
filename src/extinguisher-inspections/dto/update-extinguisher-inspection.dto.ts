import { PartialType } from '@nestjs/mapped-types';

import { CreateExtinguisherInspectionDto } from './create-extinguisher-inspection.dto';

export class UpdateExtinguisherInspectionDto extends PartialType(
  CreateExtinguisherInspectionDto,
) {}
