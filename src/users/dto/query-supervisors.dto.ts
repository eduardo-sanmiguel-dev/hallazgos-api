import { IsPositive, ValidateIf } from 'class-validator';

/**
 * Filtros de GET /users/supervisors. Con planta y zona responde solo los
 * supervisores de esa zona, sin relaciones (formulario de nuevo hallazgo);
 * sin ellos, la lista completa como antes.
 */
export class QuerySupervisorsDto {
  // Obligatoria si llega zoneId: una zona sola no basta para acotar.
  @ValidateIf((query: QuerySupervisorsDto) => query.zoneId !== undefined)
  @IsPositive()
  manufacturingPlantId?: number;

  @ValidateIf(
    (query: QuerySupervisorsDto) => query.manufacturingPlantId !== undefined,
  )
  @IsPositive()
  zoneId?: number;
}
