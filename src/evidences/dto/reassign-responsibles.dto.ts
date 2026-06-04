import { ArrayUnique, IsArray, IsInt, Min } from 'class-validator';

export class ReassignResponsiblesDto {
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @ArrayUnique()
  responsibleIds: number[];
}
