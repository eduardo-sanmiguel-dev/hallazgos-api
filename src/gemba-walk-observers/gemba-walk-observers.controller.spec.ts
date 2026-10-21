import { buildAdmin, describeCrudContract } from '@test/utils';
import { GembaWalkObserversController } from './gemba-walk-observers.controller';
import { GembaWalkObserversService } from './gemba-walk-observers.service';

describeCrudContract({
  user: buildAdmin(),
  path: '/gemba-walk/observers',
  controller: GembaWalkObserversController,
  service: GembaWalkObserversService,
  create: {
    valid: { manufacturingPlantId: 1, gembaWalkZoneId: 3, userIds: [20, 21] },
    invalid: [
      [
        'sin usuarios',
        { manufacturingPlantId: 1, gembaWalkZoneId: 3, userIds: [] },
      ],
      [
        'con usuarios repetidos',
        { manufacturingPlantId: 1, gembaWalkZoneId: 3, userIds: [20, 20] },
      ],
    ],
  },
  list: {
    query: { userName: 'ana', gembaWalkZoneId: '3' },
    expected: { userName: 'ana', gembaWalkZoneId: 3 },
  },
  findOne: true,
  update: {
    valid: { userId: 21 },
    invalid: [['con usuario 0', { userId: 0 }]],
  },
  remove: true,
});
