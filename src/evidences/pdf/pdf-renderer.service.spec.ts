import { HttpException, HttpStatus } from '@nestjs/common';

import { ERROR_CODES } from '../../shared/errors/error-codes.js';
import {
  PDF_BUSY_MESSAGE,
  PdfRendererService,
} from './pdf-renderer.service.js';

// Usa el hilo real (render-pdf.worker.mjs) con pdfmake.
describe('PdfRendererService', () => {
  let renderer: PdfRendererService;

  beforeEach(() => (renderer = new PdfRendererService()));
  afterEach(() => renderer.onModuleDestroy());

  it('arma el PDF en un hilo y lo devuelve como Buffer', async () => {
    const pdf = await renderer.render({ content: ['Hallazgos'] });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('pdfmake no descarga URLs ni lee archivos fuera de sus fuentes', async () => {
    await expect(
      renderer.render({ content: [{ image: 'https://example.com/x.png' }] }),
    ).rejects.toThrow();
    await expect(
      renderer.render({ content: [{ image: '/etc/passwd' }] }),
    ).rejects.toThrow();
    // Un error del documento no deja inservible el hilo.
    await expect(renderer.render({ content: ['ok'] })).resolves.toBeInstanceOf(
      Buffer,
    );
  });

  it('con la cola llena responde 429 con código TOO_MANY_REQUESTS', async () => {
    const doc = { content: ['x'] };
    // Uno corre y cuatro esperan.
    const accepted = Array.from({ length: 5 }, () => renderer.render(doc));

    const error = await renderer.render(doc).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect((error as HttpException).getResponse()).toEqual({
      message: PDF_BUSY_MESSAGE,
      code: ERROR_CODES.tooManyRequests,
    });
    await expect(Promise.all(accepted)).resolves.toHaveLength(5);
  });
});
