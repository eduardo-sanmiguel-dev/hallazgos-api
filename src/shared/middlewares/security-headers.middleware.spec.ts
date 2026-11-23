import express from 'express';
import request from 'supertest';

import { securityHeaders } from './security-headers.middleware.js';

describe('securityHeaders', () => {
  const app = express()
    .use(securityHeaders())
    .get('/', (_req, res) => {
      res.json({ ok: true });
    });

  it('CSP sin permisos: una respuesta abierta como página no ejecuta nada', async () => {
    const res = await request(app).get('/').expect(200);

    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'",
    );
  });

  it('solo HTTPS durante un año y sin iframes ajenos', async () => {
    const res = await request(app).get('/').expect(200);

    expect(res.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  // Valores por omisión de helmet: se fijan aquí para que una actualización
  // no los quite sin que nadie lo note.
  it('no revela el servidor ni envía la URL de origen a otros sitios', async () => {
    const res = await request(app).get('/').expect(200);

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['x-permitted-cross-domain-policies']).toBe('none');
  });

  it('conserva nosniff y deja que la UI (otro origen) cargue imágenes y PDF', async () => {
    const res = await request(app).get('/').expect(200);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});
