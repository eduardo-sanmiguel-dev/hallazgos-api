import { SpanStatusCode } from '@opentelemetry/api';

import { spanRecorder } from '../../../test/utils/index.js';
import { traced } from './traced.js';

describe('traced', () => {
  const recorder = spanRecorder();

  beforeAll(() => recorder.install());
  afterAll(() => recorder.uninstall());
  beforeEach(() => recorder.reset());

  it('envuelve el trabajo en un span con sus atributos y lo cierra', async () => {
    await expect(
      traced('excel.build', { 'excel.rows': 3 }, async (span) => {
        span.setAttribute('excel.bytes', 10);
        return 'ok';
      }),
    ).resolves.toBe('ok');

    expect(recorder.spans).toEqual([
      {
        name: 'excel.build',
        attributes: { 'excel.rows': 3, 'excel.bytes': 10 },
        exceptions: [],
        ended: true,
      },
    ]);
  });

  it('un error queda en el span (estado ERROR) y se relanza', async () => {
    const error = new Error('Sin memoria');

    await expect(
      traced('pdf.render', {}, async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    const [span] = recorder.spans;
    expect(span.status).toEqual({
      code: SpanStatusCode.ERROR,
      message: 'Sin memoria',
    });
    expect(span.exceptions).toEqual([error]);
    expect(span.ended).toBe(true);
  });

  it('un valor lanzado que no es Error también se registra', async () => {
    await expect(
      traced('mail.freeze', {}, () => Promise.reject('texto')),
    ).rejects.toBe('texto');

    const [span] = recorder.spans;
    expect(span.status?.message).toBe('texto');
    expect(span.exceptions).toEqual([new Error('texto')]);
  });
});
