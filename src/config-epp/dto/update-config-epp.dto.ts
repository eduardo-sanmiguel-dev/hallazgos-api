import { PartialType } from '@nestjs/mapped-types';
import { CreateConfigEppDto } from './create-config-epp.dto';

export class UpdateConfigEppDto extends PartialType(CreateConfigEppDto) {}
