import {
  buildAdmin,
  createHttpTestApp,
  describeCrudContract,
  mockProvider,
} from '../../test/utils/index.js';
import { GembaWalkCalendarController } from './gemba-walk-calendar.controller.js';
import { GembaWalkCalendarService } from './gemba-walk-calendar.service.js';

describeCrudContract({
  user: buildAdmin(),
  path: '/gemba-walk/calendar',
  controller: GembaWalkCalendarController,
  service: GembaWalkCalendarService,
  create: {
    valid: {
      events: [
        { gembaWalkZoneId: 3, scheduledAt: '2026-11-01T09:00:00-06:00' },
      ],
    },
    invalid: [
      ['sin eventos', { events: [] }],
      [
        'con una fecha sin zona horaria',
        {
          events: [{ gembaWalkZoneId: 3, scheduledAt: '2026-11-01T09:00:00' }],
        },
      ],
    ],
  },
  list: {
    query: { startDate: '2026-11-01T00:00:00Z', isAdditional: 'true' },
    invalid: [
      ['con fecha sin zona horaria', { startDate: '2026-11-01T00:00:00' }],
      ['con isAdditional no booleano', { isAdditional: 'tal vez' }],
    ],
  },
  findOne: true,
  remove: true,
});

describe('PATCH /gemba-walk/calendar (varios eventos)', () => {
  it('valida cada evento y llama al servicio', async () => {
    const http = await createHttpTestApp({
      user: buildAdmin(),
      controllers: [GembaWalkCalendarController],
      providers: [mockProvider(GembaWalkCalendarService)],
    });
    const service = http.get(GembaWalkCalendarService);

    await http
      .http()
      .patch('/gemba-walk/calendar')
      .send({ events: [{ id: 1, isAdditional: true }] })
      .expect(200);
    expect(service.update).toHaveBeenCalledWith({
      events: [{ id: 1, isAdditional: true }],
    });

    await http
      .http()
      .patch('/gemba-walk/calendar')
      .send({ events: [{ isAdditional: true }] })
      .expect(400);
    expect(service.update).toHaveBeenCalledTimes(1);
    await http.close();
  });
});
