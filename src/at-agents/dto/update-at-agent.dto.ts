import { PartialType } from '@nestjs/mapped-types';
import { CreateAtAgentDto } from './create-at-agent.dto.js';

export class UpdateAtAgentDto extends PartialType(CreateAtAgentDto) {}
