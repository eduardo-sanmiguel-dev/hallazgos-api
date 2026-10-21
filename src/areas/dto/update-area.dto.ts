import { PartialType } from '@nestjs/mapped-types';
import { CreateAreaDto } from './create-area.dto.js';

export class UpdateAreaDto extends PartialType(CreateAreaDto) {}
