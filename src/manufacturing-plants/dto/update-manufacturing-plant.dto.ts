import { PartialType } from '@nestjs/mapped-types';
import { CreateManufacturingPlantDto } from './create-manufacturing-plant.dto.js';

export class UpdateManufacturingPlantDto extends PartialType(CreateManufacturingPlantDto) {}
