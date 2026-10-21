import { buildAdmin } from '@test/utils';
/**
 * Contrato HTTP de los catálogos de configuración con CRUD completo
 * (procesos, tipos principales y secundarios).
 */
import {
  createHttpTestApp,
  describeCrudContract,
  mockProvider,
} from '@test/utils';
import { MainTypesController } from 'main-types/main-types.controller';
import { MainTypesService } from 'main-types/main-types.service';
import { ProcessesController } from 'processes/processes.controller';
import { ProcessesService } from 'processes/processes.service';
import { SecondaryTypesController } from 'secondary-types/secondary-types.controller';
import { SecondaryTypesService } from 'secondary-types/secondary-types.service';

describeCrudContract({
  user: buildAdmin(),
  path: '/Processes',
  controller: ProcessesController,
  service: ProcessesService,
  create: {
    valid: { name: 'Calidad', manufacturingPlantId: 1 },
    invalid: [['sin planta', { name: 'Calidad' }]],
  },
  list: {
    query: { manufacturingPlantNames: 'Tepotzotlán,Manizales' },
    expected: { manufacturingPlantNames: ['Tepotzotlán', 'Manizales'] },
  },
  findOne: true,
  update: { valid: { name: 'Calidad 2' } },
  remove: true,
});

describeCrudContract({
  user: buildAdmin(),
  path: '/main-types',
  controller: MainTypesController,
  service: MainTypesService,
  create: {
    valid: { name: 'Acto inseguro' },
    invalid: [['sin nombre', {}]],
  },
  list: { query: { name: 'acto' } },
  findOne: true,
  update: { valid: { name: 'Otro' } },
  remove: true,
});

describeCrudContract({
  user: buildAdmin(),
  path: '/secondary-types',
  controller: SecondaryTypesController,
  service: SecondaryTypesService,
  create: {
    valid: { name: 'Derrames', mainTypeId: 1, typeResponsible: 'Supervisor' },
    invalid: [['sin responsable', { name: 'Derrames', mainTypeId: 1 }]],
  },
  list: { query: { mainTypeId: '1' }, expected: { mainTypeId: 1 } },
  findOne: true,
  update: { valid: { name: 'Otro' } },
  remove: true,
});

describe('GET /secondary-types/by/manufacturing-plant/:id', () => {
  it('lista por tipo principal con el id numérico', async () => {
    const http = await createHttpTestApp({
      user: buildAdmin(),
      controllers: [SecondaryTypesController],
      providers: [mockProvider(SecondaryTypesService)],
    });
    const service = http.get(SecondaryTypesService);

    await http
      .http()
      .get('/secondary-types/by/manufacturing-plant/3')
      .expect(200);

    expect(service.findAllByManufacturingPlant).toHaveBeenCalledWith(3);
    await http.close();
  });
});
