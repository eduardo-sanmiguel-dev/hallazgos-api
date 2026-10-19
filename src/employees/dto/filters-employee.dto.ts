import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export const SIGNATURE_STATUSES = [
  'complete', // guía con las 3 firmas
  'pending', // guía con alguna firma faltante
  'no-guide', // sin guía para el puesto actual
] as const;
export type SignatureStatus = (typeof SIGNATURE_STATUSES)[number];

export class FiltersEmployeeDto {
  @IsOptional()
  @IsPositive()
  readonly manufacturingPlantId?: number;

  @IsOptional()
  @IsString()
  readonly name?: string;

  @IsOptional()
  @IsPositive()
  readonly positionId?: number;

  @IsOptional()
  @IsPositive()
  readonly areaId?: number;

  @IsOptional()
  @IsPositive()
  readonly genreId?: number;

  @IsOptional()
  @IsPositive()
  readonly assignedUserId?: number;

  @IsOptional()
  @IsBooleanString()
  readonly isActive?: string;

  @IsOptional()
  @IsPositive()
  readonly page?: number;

  // -1 = sin límite (todos los registros)
  @IsOptional()
  @IsInt()
  readonly limit?: number;

  // Estado de la guía de entrenamiento del puesto actual del colaborador.
  @IsOptional()
  @IsIn(SIGNATURE_STATUSES)
  readonly signatureStatus?: SignatureStatus;
}
