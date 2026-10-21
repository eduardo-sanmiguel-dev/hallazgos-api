import { PartialType } from '@nestjs/mapped-types';
import { CreateAccidentPositionDto } from './create-accident-position.dto.js';

export class UpdateAccidentPositionDto extends PartialType(CreateAccidentPositionDto) {}
