import { buildAdmin } from '@test/utils';
import { describeCrudContract } from '@test/utils';
import { ManufacturingPlantsController } from './manufacturing-plants.controller';
import { ManufacturingPlantsService } from './manufacturing-plants.service';

const valid = { name: 'Nueva', link: 'https://x.test', lat: 19.6, lng: -99.2 };

describeCrudContract({
  user: buildAdmin(),
  path: '/manufacturing-plants',
  controller: ManufacturingPlantsController,
  service: ManufacturingPlantsService,
  create: {
    valid,
    invalid: [
      ['con una liga que no es URL', { ...valid, link: 'no-url' }],
      ['con una latitud imposible (antes se aceptaba)', { ...valid, lat: 120 }],
      ['con longitud fuera de rango', { ...valid, lng: 200 }],
    ],
  },
  list: {
    query: { name: 'tepo', page: '1', limit: '10' },
    expected: { name: 'tepo', page: 1, limit: 10 },
  },
  findOne: true,
  update: {
    valid: { name: 'Renombrada' },
    invalid: [['con latitud 95', { lat: 95 }]],
  },
  remove: true,
});
