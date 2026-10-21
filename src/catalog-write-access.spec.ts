import { RequestMethod, type Type } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import {
  buildUser,
  buildSupervisor,
  buildAdmin,
  createHttpTestApp,
  mockProvider,
} from '../test/utils/index.js';
const controllers: Type<unknown>[] = [
  require('./manufacturing-plants/manufacturing-plants.controller.js')
    .ManufacturingPlantsController,
  require('./main-types/main-types.controller.js').MainTypesController,
  require('./secondary-types/secondary-types.controller.js')
    .SecondaryTypesController,
  require('./zones/zones.controller.js').ZonesController,
  require('./processes/processes.controller.js').ProcessesController,
  require('./areas/areas.controller.js').AreasController,
  require('./machines/machines.controller.js').MachinesController,
  require('./rules-of-life/rules-of-life.controller.js').RulesOfLifeController,
  require('./risk-factors/risk-factors.controller.js').RiskFactorsController,
  require('./working-days/working-days.controller.js').WorkingDaysController,
  require('./countries/countries.controller.js').CountriesController,
  require('./accident-positions/accident-positions.controller.js')
    .AccidentPositionsController,
  require('./associated-tasks/associated-tasks.controller.js')
    .AssociatedTasksController,
  require('./at-agents/at-agents.controller.js').AtAgentsController,
  require('./at-mechanisms/at-mechanisms.controller.js').AtMechanismsController,
  require('./body-parts/body-parts.controller.js').BodyPartsController,
  require('./cie-diagnoses/cie-diagnoses.controller.js').CieDiagnosesController,
  require('./genres/genres.controller.js').GenresController,
  require('./nature-of-events/nature-of-events.controller.js')
    .NatureOfEventsController,
  require('./type-of-injuries/type-of-injuries.controller.js')
    .TypeOfInjuriesController,
  require('./type-of-links/type-of-links.controller.js').TypeOfLinksController,
  require('./types-of-events/types-of-events.controller.js')
    .TypesOfEventsController,
  require('./safety-data-files/safety-data-files.controller.js')
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
