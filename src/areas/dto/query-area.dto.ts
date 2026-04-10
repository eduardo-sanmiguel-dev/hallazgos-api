import { IsOptional, IsString } from 'class-validator';

export class QueryAreaDto {
  @IsOptional()
  @IsString()
  name?: string;
}
