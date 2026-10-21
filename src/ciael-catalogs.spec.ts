import { buildAdmin } from '@test/utils';
/**
 * Catálogos de CIAEL y de configuración con la misma forma: crear (guarda el
 * cuerpo tal cual) y listar activos. findOne/update/remove son stubs generados
 * por Nest (responden un texto sin hacer nada): no se prueban; están
 * registrados como decisión pendiente en docs/avance-pruebas.md.
 */
import { Type } from '@nestjs/common';
import { ObjectLiteral } from 'typeorm';

import {
  createHttpTestApp,
  createServiceTestingModule,
  mockProvider,
} from '@test/utils';
import { AccidentPositionsController } from 'accident-positions/accident-positions.controller';
import { AccidentPositionsService } from 'accident-positions/accident-positions.service';
import { AccidentPosition } from 'accident-positions/entities/accident-position.entity';
import { AssociatedTasksController } from 'associated-tasks/associated-tasks.controller';
import { AssociatedTasksService } from 'associated-tasks/associated-tasks.service';
import { AssociatedTask } from 'associated-tasks/entities/associated-task.entity';
import { AtAgentsController } from 'at-agents/at-agents.controller';
import { AtAgentsService } from 'at-agents/at-agents.service';
import { AtAgent } from 'at-agents/entities/at-agent.entity';
import { AtMechanismsController } from 'at-mechanisms/at-mechanisms.controller';
import { AtMechanismsService } from 'at-mechanisms/at-mechanisms.service';
import { AtMechanism } from 'at-mechanisms/entities/at-mechanism.entity';
import { BodyPartsController } from 'body-parts/body-parts.controller';
import { BodyPartsService } from 'body-parts/body-parts.service';
import { BodyPart } from 'body-parts/entities/body-part.entity';
import { CieDiagnosesController } from 'cie-diagnoses/cie-diagnoses.controller';
import { CieDiagnosesService } from 'cie-diagnoses/cie-diagnoses.service';
import { CieDiagnosis } from 'cie-diagnoses/entities/cie-diagnosis.entity';
import { CountriesController } from 'countries/countries.controller';
import { CountriesService } from 'countries/countries.service';
import { Country } from 'countries/entities/country.entity';
import { Genre } from 'genres/entities/genre.entity';
import { GenresController } from 'genres/genres.controller';
import { GenresService } from 'genres/genres.service';
import { Machine } from 'machines/entities/machine.entity';
import { MachinesController } from 'machines/machines.controller';
import { MachinesService } from 'machines/machines.service';
import { NatureOfEvent } from 'nature-of-events/entities/nature-of-event.entity';
import { NatureOfEventsController } from 'nature-of-events/nature-of-events.controller';
import { NatureOfEventsService } from 'nature-of-events/nature-of-events.service';
import { RiskFactor } from 'risk-factors/entities/risk-factor.entity';
import { RiskFactorsController } from 'risk-factors/risk-factors.controller';
import { RiskFactorsService } from 'risk-factors/risk-factors.service';
import { TypeOfInjury } from 'type-of-injuries/entities/type-of-injury.entity';
import { TypeOfInjuriesController } from 'type-of-injuries/type-of-injuries.controller';
import { TypeOfInjuriesService } from 'type-of-injuries/type-of-injuries.service';
import { TypeOfLink } from 'type-of-links/entities/type-of-link.entity';
import { TypeOfLinksController } from 'type-of-links/type-of-links.controller';
import { TypeOfLinksService } from 'type-of-links/type-of-links.service';
import { TypesOfEvent } from 'types-of-events/entities/types-of-event.entity';
import { TypesOfEventsController } from 'types-of-events/types-of-events.controller';
import { TypesOfEventsService } from 'types-of-events/types-of-events.service';
import { WorkingDay } from 'working-days/entities/working-day.entity';
import { WorkingDaysController } from 'working-days/working-days.controller';
import { WorkingDaysService } from 'working-days/working-days.service';

type AnyService = Record<string, (...args: unknown[]) => unknown>;

interface Catalog {
  path: string;
  service: Type<unknown>;
  controller: Type<unknown>;
  entity: Type<ObjectLiteral>;
  /** Cómo lista: activos por nombre, activos filtrables por planta o stub. */
  list: 'byName' | 'byPlant' | 'stub';
  /**
   * BUG pendiente: create usa repository.create (solo arma el objeto en
   * memoria) y no guarda nada aunque responda 201.
   */
  createDoesNotSave?: true;
}

const CATALOGS: Catalog[] = [
  {
    path: '/accident-positions',
    service: AccidentPositionsService,
    controller: AccidentPositionsController,
    entity: AccidentPosition,
    list: 'byPlant',
  },
  {
    path: '/associated-tasks',
    service: AssociatedTasksService,
    controller: AssociatedTasksController,
    entity: AssociatedTask,
    list: 'byPlant',
    createDoesNotSave: true,
  },
  {
    path: '/machines',
    service: MachinesService,
    controller: MachinesController,
    entity: Machine,
    list: 'byPlant',
  },
  {
    path: '/at-agents',
    service: AtAgentsService,
    controller: AtAgentsController,
    entity: AtAgent,
    list: 'byName',
  },
  {
    path: '/at-mechanisms',
    service: AtMechanismsService,
    controller: AtMechanismsController,
    entity: AtMechanism,
    list: 'byName',
    createDoesNotSave: true,
  },
  {
    path: '/body-parts',
    service: BodyPartsService,
    controller: BodyPartsController,
    entity: BodyPart,
    list: 'byName',
    createDoesNotSave: true,
  },
  {
    path: '/cie-diagnoses',
    service: CieDiagnosesService,
    controller: CieDiagnosesController,
    entity: CieDiagnosis,
    list: 'byName',
  },
  {
    path: '/nature-of-events',
    service: NatureOfEventsService,
    controller: NatureOfEventsController,
    entity: NatureOfEvent,
    list: 'byName',
  },
  {
    path: '/risk-factors',
    service: RiskFactorsService,
    controller: RiskFactorsController,
    entity: RiskFactor,
    list: 'byName',
  },
  {
    path: '/type-of-injuries',
    service: TypeOfInjuriesService,
    controller: TypeOfInjuriesController,
    entity: TypeOfInjury,
    list: 'byName',
  },
  {
    path: '/type-of-links',
    service: TypeOfLinksService,
    controller: TypeOfLinksController,
    entity: TypeOfLink,
    list: 'byName',
  },
  {
    path: '/types-of-events',
    service: TypesOfEventsService,
    controller: TypesOfEventsController,
    entity: TypesOfEvent,
    list: 'byName',
  },
  {
    path: '/working-days',
    service: WorkingDaysService,
    controller: WorkingDaysController,
    entity: WorkingDay,
    list: 'byName',
  },
  {
    path: '/countries',
    service: CountriesService,
    controller: CountriesController,
    entity: Country,
    list: 'stub',
  },
  {
    path: '/genres',
    service: GenresService,
    controller: GenresController,
    entity: Genre,
    list: 'stub',
  },
];

describe.each(CATALOGS)(
  'Catálogo $path',
  ({ path, service: Service, controller, entity, list, createDoesNotSave }) => {
    describe('servicio', () => {
      const setup = async () => {
        const testing = await createServiceTestingModule(Service, {
          repositories: [entity],
        });
        return {
          service: testing.service as unknown as AnyService,
          repo: testing.repository(entity),
        };
      };

      (createDoesNotSave ? it.failing : it)(
        'create guarda el cuerpo recibido',
        async () => {
          const { service, repo } = await setup();

          await service.create({ name: 'Nuevo' });

          expect(repo.save).toHaveBeenCalledWith({ name: 'Nuevo' });
        },
      );

      if (list === 'byName') {
        it('findAll lista activos ordenados por nombre', async () => {
          const { service, repo } = await setup();
          repo.find.mockResolvedValue([{ id: 1 }]);

          await expect(service.findAll()).resolves.toEqual([{ id: 1 }]);
          expect(repo.find).toHaveBeenCalledWith({
            where: { isActive: true },
            order: { name: 'ASC' },
          });
        });
      }

      if (list === 'byPlant') {
        it('findAll lista activos y filtra por planta si se pide', async () => {
          const { service, repo } = await setup();

          await service.findAll({});
          await service.findAll({ manufacturingPlantId: 2 });

          expect(repo.find).toHaveBeenNthCalledWith(1, {
            where: { isActive: true },
          });
          expect(repo.find).toHaveBeenNthCalledWith(2, {
            where: { isActive: true, manufacturingPlants: { id: 2 } },
          });
        });
      }
    });

    describe('controlador (HTTP)', () => {
      it(`GET ${path} delega la lista al servicio`, async () => {
        const http = await createHttpTestApp({
          user: buildAdmin(),
          controllers: [controller],
          providers: [mockProvider(Service)],
        });
        const service = http.get(Service) as unknown as Record<
          string,
          jest.Mock
        >;
        service.findAll.mockResolvedValue([{ id: 1 }]);

        const query = list === 'byPlant' ? { manufacturingPlantId: '2' } : {};
        await http.http().get(path).query(query).expect(200);

        if (list === 'byPlant') {
          expect(service.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ manufacturingPlantId: 2 }),
          );
        } else {
          expect(service.findAll).toHaveBeenCalled();
        }

        await http.http().get(`${path}/12`).expect(200);
        expect(service.findOne).toHaveBeenCalledWith(12);
        await http.close();
      });
    });
  },
);
