import { PartialType } from '@nestjs/mapped-types';

import { CreateConfigsTgDto } from './create-configs-tg.dto';

export class UpdateConfigsTgDto extends PartialType(CreateConfigsTgDto) {}
