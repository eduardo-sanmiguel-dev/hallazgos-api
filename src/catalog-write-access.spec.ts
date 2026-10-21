import { RequestMethod, Type } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import {
  buildUser,
  buildSupervisor,
  buildAdmin,
  createHttpTestApp,
  mockProvider,
} from '@test/utils';
const controllers: Type<unknown>[] = [
  require('./manufacturing-plants/manufacturing-plants.controller')
    .ManufacturingPlantsController,
  require('./main-types/main-types.controller').MainTypesController,
  require('./secondary-types/secondary-types.controller')
    .SecondaryTypesController,
  require('./zones/zones.controller').ZonesController,
  require('./processes/processes.controller').ProcessesController,
  require('./areas/areas.controller').AreasController,
  require('./machines/machines.controller').MachinesController,
  require('./rules-of-life/rules-of-life.controller').RulesOfLifeController,
  require('./risk-factors/risk-factors.controller').RiskFactorsController,
  require('./working-days/working-days.controller').WorkingDaysController,
  require('./countries/countries.controller').CountriesController,
  require('./accident-positions/accident-positions.controller')
    .AccidentPositionsController,
  require('./associated-tasks/associated-tasks.controller')
    .AssociatedTasksController,
  require('./at-agents/at-agents.controller').AtAgentsController,
  require('./at-mechanisms/at-mechanisms.controller').AtMechanismsController,
  require('./body-parts/body-parts.controller').BodyPartsController,
  require('./cie-diagnoses/cie-diagnoses.controller').CieDiagnosesController,
  require('./genres/genres.controller').GenresController,
  require('./nature-of-events/nature-of-events.controller')
    .NatureOfEventsController,
  require('./type-of-injuries/type-of-injuries.controller')
    .TypeOfInjuriesController,
  require('./type-of-links/type-of-links.controller').TypeOfLinksController,
  require('./types-of-events/types-of-events.controller')
    .TypesOfEventsController,
  require('./safety-data-files/safety-data-files.controller')
    .SafetyDataFilesController,
];
describe.each(controllers)('Permisos de escritura: %p', (Controller) => {
  it('rechaza General y Supervisor en cada ruta de escritura', async () => {
    const Service = Reflect.getMetadata('design:paramtypes', Controller)[0];
    const http = await createHttpTestApp({
      controllers: [Controller],
      providers: [mockProvider(Service)],
      user: buildUser(),
    });
    try {
      const prefix = Reflect.getMetadata(PATH_METADATA, Controller);
      for (const name of Object.getOwnPropertyNames(Controller.prototype)) {
        const method = Controller.prototype[name];
        const verb = Reflect.getMetadata(METHOD_METADATA, method);
        if (
          ![
            RequestMethod.POST,
            RequestMethod.PATCH,
            RequestMethod.DELETE,
            RequestMethod.PUT,
          ].includes(verb)
        )
          continue;
        const route = (
          '/' +
          prefix +
          '/' +
          Reflect.getMetadata(PATH_METADATA, method)
        )
          .replace(/\/+/g, '/')
          .replace(/:[^/]+/g, '1');
        for (const user of [buildUser(), buildSupervisor()]) {
          http.setUser(user);
          await http
            .http()
            [RequestMethod[verb].toLowerCase()](route)
            .send({})
            .expect(403);
        }
        http.setUser(buildAdmin());
        const response = await http
          .http()
          [RequestMethod[verb].toLowerCase()](route)
          .send({});
        expect([401, 403]).not.toContain(response.status);
      }
    } finally {
      await http.close();
    }
  });
});
