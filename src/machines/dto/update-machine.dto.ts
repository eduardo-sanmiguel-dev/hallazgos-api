import { PartialType } from '@nestjs/mapped-types';
import { CreateMachineDto } from './create-machine.dto.js';

export class UpdateMachineDto extends PartialType(CreateMachineDto) {}
