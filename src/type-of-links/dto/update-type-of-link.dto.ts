import { PartialType } from '@nestjs/mapped-types';
import { CreateTypeOfLinkDto } from './create-type-of-link.dto.js';

export class UpdateTypeOfLinkDto extends PartialType(CreateTypeOfLinkDto) {}
