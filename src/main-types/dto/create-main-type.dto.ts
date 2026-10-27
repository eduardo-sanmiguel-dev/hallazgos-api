import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMainTypeDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  // Foto de evidencia obligatoria al crear y cerrar (por defecto, sí).
  @IsOptional()
  @IsBoolean()
  requiresEvidence?: boolean;
}
