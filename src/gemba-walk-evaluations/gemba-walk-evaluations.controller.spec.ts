import {
  buildAdmin,
  createHttpTestApp,
  describeCrudContract,
  mockProvider,
} from '../../test/utils/index.js';
import { GEMBA_WALK_EVALUATION_CATEGORIES } from './gemba-walk-evaluation-categories.js';
import { GembaWalkEvaluationsController } from './gemba-walk-evaluations.controller.js';
import { GembaWalkEvaluationsService } from './gemba-walk-evaluations.service.js';

describeCrudContract({
  user: buildAdmin(),
  path: '/gemba-walk/evaluations',
  controller: GembaWalkEvaluationsController,
  service: GembaWalkEvaluationsService,
  create: {
    valid: {
      manufacturingPlantId: 1,
      area: 'Almacén',
      category: 'SHE',
      description: 'Pasillos libres',
    },
    invalid: [
      [
        'con una categoría no permitida',
        {
          manufacturingPlantId: 1,
          area: 'Almacén',
          category: 'OTRA',
          description: 'x',
        },
      ],
    ],
  },
  list: {
    query: { category: 'CALIDAD', search: 'pasillo' },
    invalid: [['con una categoría no permitida', { category: 'OTRA' }]],
  },
  findOne: true,
  update: { valid: { description: 'Nueva' } },
  remove: true,
});

describe('GET /gemba-walk/evaluations/categories', () => {
  it('devuelve las categorías permitidas (no la confunde con /:id)', async () => {
    const http = await createHttpTestApp({
      controllers: [GembaWalkEvaluationsController],
      providers: [mockProvider(GembaWalkEvaluationsService)],
    });

    await http
      .http()
      .get('/gemba-walk/evaluations/categories')
      .expect(200, [...GEMBA_WALK_EVALUATION_CATEGORIES]);
    await http.close();
  });
});
