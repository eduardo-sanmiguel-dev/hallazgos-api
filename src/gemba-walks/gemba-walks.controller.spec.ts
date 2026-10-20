import {
  buildUser,
  createHttpTestApp,
  HttpTestApp,
  mockProvider,
} from '@test/utils';
import { GembaWalksController } from './gemba-walks.controller';
import { GembaWalksService } from './gemba-walks.service';

describe('GembaWalksController (HTTP)', () => {
  let http: HttpTestApp;
  let service: jest.Mocked<GembaWalksService>;

  beforeAll(async () => {
    http = await createHttpTestApp({
      controllers: [GembaWalksController],
      providers: [mockProvider(GembaWalksService)],
      user: buildUser(),
    });
    service = http.get(GembaWalksService);
  });

  afterAll(() => http.close());

  beforeEach(() => jest.clearAllMocks());

  it('GET access', async () => {
    service.access.mockResolvedValue({ isObserver: true });

    await http
      .http()
      .get('/gemba-walk/walks/access')
      .expect(200, { isObserver: true });
  });

  it('GET calendar exige planta y fechas con zona horaria', async () => {
    await http
      .http()
      .get('/gemba-walk/walks/calendar')
      .query({
        manufacturingPlantId: 1,
        startDate: '2026-10-01T00:00:00-06:00',
        endDate: '2026-11-01T00:00:00-06:00',
      })
      .expect(200);
    expect(service.findCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ manufacturingPlantId: 1 }),
    );

    await http
      .http()
      .get('/gemba-walk/walks/calendar')
      .query({
        manufacturingPlantId: 1,
        startDate: '2026-10-01',
        endDate: '2026-11-01',
      })
      .expect(400);
    expect(service.findCalendar).toHaveBeenCalledTimes(1);
  });

  it('GET available-events exige planta', async () => {
    await http.http().get('/gemba-walk/walks/available-events').expect(400);
    await http
      .http()
      .get('/gemba-walk/walks/available-events')
      .query({ manufacturingPlantId: 1 })
      .expect(200);

    expect(service.findAvailableEvents).toHaveBeenCalledWith({
      manufacturingPlantId: 1,
    });
  });

  it('POST start valida el evento', async () => {
    await http
      .http()
      .post('/gemba-walk/walks/start')
      .send({ gembaWalkCalendarId: 0 })
      .expect(400);
    await http
      .http()
      .post('/gemba-walk/walks/start')
      .send({ gembaWalkCalendarId: 5 })
      .expect(201);

    expect(service.start).toHaveBeenCalledWith({ gembaWalkCalendarId: 5 });
  });

  it('POST registra el recorrido con resultados validados', async () => {
    const body = {
      gembaWalkCalendarId: 5,
      startToken: 'token',
      results: [
        { gembaWalkEvaluationId: 1, isCompliant: true, comments: 'ok' },
      ],
    };

    await http.http().post('/gemba-walk/walks').send(body).expect(201);
    expect(service.create).toHaveBeenCalledWith(body);

    await http
      .http()
      .post('/gemba-walk/walks')
      .send({
        ...body,
        results: [
          {
            gembaWalkEvaluationId: 1,
            isCompliant: true,
            comments: 'x'.repeat(1001),
          },
        ],
      })
      .expect(400);
    await http
      .http()
      .post('/gemba-walk/walks')
      .send({ ...body, results: [] })
      .expect(400);
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('GET lista con filtros y GET :id', async () => {
    await http
      .http()
      .get('/gemba-walk/walks')
      .query({ page: 1, limit: 10, isAdditional: 'false' })
      .expect(200);
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10, isAdditional: 'false' }),
    );

    await http.http().get('/gemba-walk/walks/7').expect(200);
    expect(service.findOne).toHaveBeenCalledWith(7);
  });
});
