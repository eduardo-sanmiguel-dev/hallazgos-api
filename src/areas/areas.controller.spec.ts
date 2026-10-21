import { buildAdmin } from '@test/utils';
import { describeCrudContract } from '@test/utils';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';

describeCrudContract({
  user: buildAdmin(),
  path: '/areas',
  controller: AreasController,
  service: AreasService,
  create: {
    valid: { name: 'Almacén', manufacturingPlantId: 1, zoomLevel: 1.5 },
    invalid: [
      ['sin planta', { name: 'Almacén' }],
      [
        'con coordenada negativa',
        { name: 'A', manufacturingPlantId: 1, coordinateX: -1 },
      ],
      ['con zoom 0', { name: 'A', manufacturingPlantId: 1, zoomLevel: 0 }],
    ],
  },
  list: {
    query: { name: 'alm', manufacturingPlantId: '1' },
    expected: { name: 'alm', manufacturingPlantId: 1 },
  },
  findOne: true,
  update: { valid: { coordinateX: 5 } },
  remove: true,
});
