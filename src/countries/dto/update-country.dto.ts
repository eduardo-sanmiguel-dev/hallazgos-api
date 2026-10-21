import { PartialType } from '@nestjs/mapped-types';

import { CreateCountryDto } from './create-country.dto.js';

export class UpdateCountryDto extends PartialType(CreateCountryDto) {}
