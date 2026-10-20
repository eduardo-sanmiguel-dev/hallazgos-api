import { describeCrudContract } from '@test/utils';
import { GembaWalkZonesController } from './gemba-walk-zones.controller';
import { GembaWalkZonesService } from './gemba-walk-zones.service';

describeCrudContract({
  path: '/gemba-walk/zones',
  controller: GembaWalkZonesController,
  service: GembaWalkZonesService,
  create: {
    valid: {
      manufacturingPlantId: 1,
      nameZone: 'Producción',
      nameLocation: 'L1',
    },
    invalid: [
      ['sin planta', { nameZone: 'Producción', nameLocation: 'L1' }],
      [
        'con nombre vacío',
        { manufacturingPlantId: 1, nameZone: '', nameLocation: 'L1' },
      ],
    ],
  },
  list: {
    query: {
      manufacturingPlantId: '1',
      nameZone: 'Prod',
      page: '1',
      limit: '10',
    },
    expected: { manufacturingPlantId: 1, nameZone: 'Prod', page: 1, limit: 10 },
    invalid: [['con límite decimal', { limit: '1.5' }]],
  },
  findOne: true,
  update: {
    valid: { nameLocation: 'L2' },
    invalid: [['con un campo desconocido', { extra: 'x' }]],
  },
  remove: true,
});
