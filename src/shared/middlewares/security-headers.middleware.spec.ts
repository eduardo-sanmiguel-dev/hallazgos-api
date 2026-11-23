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

  it('conserva nosniff y deja que la UI (otro origen) cargue imágenes y PDF', async () => {
    const res = await request(app).get('/').expect(200);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});
