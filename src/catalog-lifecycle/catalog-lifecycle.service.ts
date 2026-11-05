import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type ObjectLiteral } from 'typeorm';
import { RequestContextService } from '../shared/services/request-context.service.js';
import { catalogIncludesInactive } from '../shared/utils/catalog-visibility.js';
import { User } from '../users/entities/user.entity.js';
import { Employee } from '../employees/entities/employee.entity.js';
import { ManufacturingPlant } from '../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { Zone } from '../zones/entities/zone.entity.js';
import { Area } from '../areas/entities/area.entity.js';
import { Processes } from '../processes/entities/processes.entity.js';
import { MainType } from '../main-types/entities/main-type.entity.js';
import { SecondaryType } from '../secondary-types/entities/secondary-type.entity.js';
import { Equipment } from '../equipments/entities/equipment.entity.js';
import { EmergencyTeam } from '../emergency-teams/entities/emergency-team.entity.js';
import { GembaWalkZone } from '../gemba-walk-zones/entities/gemba-walk-zone.entity.js';
import { GembaWalkObserver } from '../gemba-walk-observers/entities/gemba-walk-observer.entity.js';
import { GembaWalkCalendar } from '../gemba-walk-calendar/entities/gemba-walk-calendar.entity.js';
import { GembaWalkEvaluation } from '../gemba-walk-evaluations/entities/gemba-walk-evaluation.entity.js';
const catalogs = {
  users: User,
  employees: Employee,
  'manufacturing-plants': ManufacturingPlant,
  zones: Zone,
  areas: Area,
  processes: Processes,
  'main-types': MainType,
  'secondary-types': SecondaryType,
  equipments: Equipment,
  'emergency-teams': EmergencyTeam,
  'gemba-walk-zones': GembaWalkZone,
  'gemba-walk-observers': GembaWalkObserver,
  'gemba-walk-calendar': GembaWalkCalendar,
  'gemba-walk-evaluations': GembaWalkEvaluation,
};
@Injectable()
export class CatalogLifecycleService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly context: RequestContextService,
  ) {}
  async activate(catalog: string, id: number) {
    catalogIncludesInactive(true);
    if (!Object.hasOwn(catalogs, catalog))
      throw new NotFoundException('Catálogo no encontrado');
    const entity = catalogs[catalog as keyof typeof catalogs];
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository<ObjectLiteral>(entity);
        // Lock only the root row: PostgreSQL cannot lock nullable outer joins.
        const root = await repository.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!root) throw new NotFoundException('Registro no encontrado');
        const relations = repository.metadata.relations
          .map(({ propertyName }) => propertyName)
          .filter((name) =>
            [
              'manufacturingPlant',
              'manufacturingPlants',
              'mainType',
              'area',
              'position',
              'gender',
              'gembaWalkZone',
              'user',
            ].includes(name),
          );
        if (relations.includes('gembaWalkZone'))
          relations.push('gembaWalkZone.manufacturingPlant');
        if (catalog === 'zones') relations.push('area.manufacturingPlant');
        if (catalog === 'gemba-walk-observers')
          relations.push('user.manufacturingPlants');
        const row = await repository.findOneOrFail({
          where: { id },
          relations,
        });
        const plant =
          row.manufacturingPlant ?? row.gembaWalkZone?.manufacturingPlant;
        if (plant) this.context.assertManufacturingPlant(plant.id);
        if (
          row.manufacturingPlants &&
          !row.manufacturingPlants.some((p: ManufacturingPlant) =>
            this.context.manufacturingPlantIds.includes(p.id),
          )
        )
          throw new NotFoundException('Registro no encontrado');
        if (row.isActive) return { id, isActive: true };
        const requireActive = (value: ObjectLiteral | null, label: string) => {
          if (!value?.isActive)
            throw new BadRequestException(`Debe reactivar primero ${label}.`);
        };
        if (plant) requireActive(plant, 'la planta');
        if (catalog === 'secondary-types')
          requireActive(row.mainType, 'el criterio principal');
        if (relations.includes('area') && row.area)
          requireActive(row.area, 'el área');
        if (row.position) requireActive(row.position, 'el puesto');
        if (row.gender) requireActive(row.gender, 'el género');
        if (row.gembaWalkZone)
          requireActive(row.gembaWalkZone, 'la zona Gemba Walk');
        if (
          row.manufacturingPlants &&
          !row.manufacturingPlants.some(
            (p: ManufacturingPlant) =>
              p.isActive && this.context.manufacturingPlantIds.includes(p.id),
          )
        )
          throw new BadRequestException(
            'El registro necesita al menos una planta activa dentro de sus permisos.',
          );
        if (
          catalog === 'zones' &&
          row.area &&
          row.area.manufacturingPlant?.id &&
          row.area.manufacturingPlant.id !== plant.id
        )
          throw new BadRequestException(
            'El área no pertenece a la planta del registro.',
          );
        if (catalog === 'gemba-walk-observers') {
          requireActive(row.user, 'el usuario observador');
          if (
            row.gembaWalkZone.manufacturingPlant.id !== plant.id ||
            !row.user.manufacturingPlants.some(
              (p: ManufacturingPlant) => p.id === plant.id,
            )
          )
            throw new BadRequestException(
              'El usuario y la zona deben pertenecer a la planta del observador.',
            );
        }
        if (
          catalog === 'gemba-walk-calendar' &&
          new Date(row.scheduledAt).getTime() <= Date.now()
        )
          throw new BadRequestException(
            'No se puede reactivar un evento pasado. Cree una nueva programación.',
          );
        const uniqueness: Record<string, string[]> = {
          areas: ['name', 'manufacturingPlantId'],
          'gemba-walk-zones': [
            'nameZone',
            'nameLocation',
            'manufacturingPlantId',
          ],
          'gemba-walk-evaluations': [
            'area',
            'category',
            'manufacturingPlantId',
          ],
          'gemba-walk-observers': ['gembaWalkZoneId', 'userId'],
          'gemba-walk-calendar': ['gembaWalkZoneId', 'scheduledAt'],
        };
        const fields = uniqueness[catalog];
        if (fields) {
          const query = repository
            .createQueryBuilder('record')
            .where('record.isActive = true')
            .andWhere('record.id <> :id', { id });
          for (const field of fields) {
            const relation = field.endsWith('Id')
              ? field.slice(0, -2)
              : undefined;
            const value = relation ? row[relation]?.id : row[field];
            query.andWhere(
              typeof value === 'string'
                ? `LOWER(record.${field}) = LOWER(:${field})`
                : `record.${field} = :${field}`,
              { [field]: value },
            );
          }
          if (await query.getExists())
            throw new ConflictException(
              'Ya existe un registro activo equivalente. Revíselo antes de reactivar este registro.',
            );
        }
        await repository.update(id, {
          isActive: true,
          ...(repository.metadata.findRelationWithPropertyPath('updatedBy') && {
            updatedBy: { id: this.context.userId },
          }),
        });
        return { id, isActive: true };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          'Ya existe un registro activo equivalente.',
        );
      throw error;
    }
  }
}
