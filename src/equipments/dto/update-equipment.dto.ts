import { PartialType } from '@nestjs/mapped-types';
import { CreateEquipmentDto } from './create-equipment.dto.js';

export class UpdateEquipmentDto extends PartialType(CreateEquipmentDto) {}
