import { PartialType } from '@nestjs/mapped-types';

import { CreateProcessesDto } from './create-processes.dto.js';

export class UpdateProcessesDto extends PartialType(CreateProcessesDto) {}
