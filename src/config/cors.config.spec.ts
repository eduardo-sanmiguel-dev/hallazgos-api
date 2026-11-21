import { CORS_PREFLIGHT_MAX_AGE_SECONDS, corsOptions } from './cors.config.js';

describe('corsOptions', () => {
  it('solo la UI, con cookies, y el preflight se recuerda 2 horas', () => {
    expect(corsOptions('https://comportarte.com')).toEqual({
      origin: 'https://comportarte.com',
      credentials: true,
      exposedHeaders: ['Content-Disposition', 'Idempotent-Replayed'],
      maxAge: 7200,
    });
    expect(CORS_PREFLIGHT_MAX_AGE_SECONDS).toBe(7200);
  });
});
