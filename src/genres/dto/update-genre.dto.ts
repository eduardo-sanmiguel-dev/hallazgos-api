import { PartialType } from '@nestjs/mapped-types';
import { CreateGenreDto } from './create-genre.dto.js';

export class UpdateGenreDto extends PartialType(CreateGenreDto) {}
