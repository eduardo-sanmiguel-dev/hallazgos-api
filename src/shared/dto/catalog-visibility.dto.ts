import { IsBooleanString, IsOptional } from 'class-validator';

/** Only administrative table requests opt in; selector requests stay active-only. */
export class CatalogVisibilityDto {
  @IsOptional()
  @IsBooleanString()
  includeInactive?: string;
}
