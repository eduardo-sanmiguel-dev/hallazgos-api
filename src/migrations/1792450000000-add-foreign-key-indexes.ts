import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices en las llaves foráneas por las que se filtra y se hacen joins
 * (planta, zona, colaborador, etc.). Postgres no los crea solo.
 *
 * Solo agrega índices: no modifica ni borra filas ni columnas. IF NOT EXISTS
 * lo hace seguro si alguno ya existe. Los nombres coinciden con los @Index de
 * las entidades.
 */
const INDEXES: [name: string, table: string, column: string][] = [
  ['IDX_epp_equipment_eppId', 'epp_equipment', 'eppId'],
  ['IDX_epp_equipment_equipmentId', 'epp_equipment', 'equipmentId'],
  ['IDX_epp_employeeId', 'epp', 'employeeId'],
  ['IDX_employee_areaId', 'employee', 'areaId'],
  ['IDX_employee_positionId', 'employee', 'positionId'],
  [
    'IDX_extinguisher_inspection_evals_inspectionId',
    'extinguisher_inspection_evaluations',
    'extinguisherInspectionId',
  ],
  [
    'IDX_extinguisher_inspections_manufacturingPlantId',
    'extinguisher_inspections',
    'manufacturingPlantId',
  ],
  ['IDX_comments_evidenceId', 'comments', 'evidenceId'],
  ['IDX_zones_manufacturingPlantId', 'zones', 'manufacturingPlantId'],
  ['IDX_zones_areaId', 'zones', 'areaId'],
  ['IDX_secondary_type_mainTypeId', 'secondary_type', 'mainTypeId'],
  [
    'IDX_emergency_teams_manufacturingPlantId',
    'emergency_teams',
    'manufacturingPlantId',
  ],
  ['IDX_areas_manufacturingPlantId', 'areas', 'manufacturingPlantId'],
  ['IDX_equipment_manufacturingPlantId', 'equipment', 'manufacturingPlantId'],
  [
    'IDX_equipment_cost_history_equipmentId',
    'equipment_cost_history',
    'equipmentId',
  ],
  ['IDX_processes_manufacturingPlantId', 'processes', 'manufacturingPlantId'],
  ['IDX_gemba_walk_results_gembaWalkId', 'gemba_walk_results', 'gembaWalkId'],
  [
    'IDX_gemba_walk_observers_manufacturingPlantId',
    'gemba_walk_observers',
    'manufacturingPlantId',
  ],
  [
    'IDX_gemba_walk_calendar_gembaWalkZoneId',
    'gemba_walk_calendar',
    'gembaWalkZoneId',
  ],
  [
    'IDX_gemba_walk_zones_manufacturingPlantId',
    'gemba_walk_zones',
    'manufacturingPlantId',
  ],
  [
    'IDX_gemba_walk_evaluations_manufacturingPlantId',
    'gemba_walk_evaluations',
    'manufacturingPlantId',
  ],
  ['IDX_ics_manufacturingPlantId', 'ics', 'manufacturingPlantId'],
  ['IDX_ciael_manufacturingPlantId', 'ciael', 'manufacturingPlantId'],
  ['IDX_ciael_employeeId', 'ciael', 'employeeId'],
  [
    'IDX_standards_of_behavior_rulesOfLifeId',
    'standards_of_behavior',
    'rulesOfLifeId',
  ],
];

export class AddForeignKeyIndexes1792450000000 implements MigrationInterface {
  name = 'AddForeignKeyIndexes1792450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, table, column] of INDEXES) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" ("${column}")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name] of [...INDEXES].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  }
}
