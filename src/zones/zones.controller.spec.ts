import { buildAdmin } from '../../test/utils/index.js';
import { describeCrudContract } from '../../test/utils/index.js';
import { ZonesController } from './zones.controller.js';
import { ZonesService } from './zones.service.js';

describeCrudContract({
  user: buildAdmin(),
  path: '/zones',
  controller: ZonesController,
  service: ZonesService,
  create: {
    valid: { name: 'Pasillo', manufacturingPlantId: 1, areaId: 4 },
    invalid: [['sin planta', { name: 'Pasillo' }]],
  },
  list: {
    query: {
      withArea: 'false',
      manufacturingPlantNames: 'Tepotzotlán',
      view: 'options',
    },
    // "false" se lee como false (no como texto no vacío).
    expected: {
      withArea: false,
      manufacturingPlantNames: ['Tepotzotlán'],
      view: 'options',
    },
    invalid: [['con una view desconocida', { view: 'todo' }]],
  },
  findOne: true,
  update: { valid: { name: 'Pasillo norte' } },
  remove: true,
});
