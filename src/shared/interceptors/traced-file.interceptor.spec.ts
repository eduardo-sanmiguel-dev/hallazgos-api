import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

import { spanRecorder } from '../../../test/utils/index.js';
import { TracedFileInterceptor } from './traced-file.interceptor.js';

describe('TracedFileInterceptor', () => {
  const recorder = spanRecorder();
  const Interceptor = TracedFileInterceptor('file', {});
  const interceptor = new (
    Interceptor as new (options?: object) => {
      intercept: (context: ExecutionContext, next: CallHandler) => unknown;
    }
  )();
  // intercept del FileInterceptor de Nest (multer), del que hereda.
  const multerIntercept = jest.spyOn(
    Object.getPrototypeOf(Interceptor.prototype),
    'intercept',
  );
  const handled = of('respuesta');
  const next = { handle: () => handled };
  const contextFor = (request: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeAll(() => recorder.install());
  afterAll(() => recorder.uninstall());
  beforeEach(() => {
    recorder.reset();
    multerIntercept.mockReset();
  });

  it('mide la recepción del archivo con el tamaño declarado y el recibido', async () => {
    const request = { headers: { 'content-length': '2048' } } as {
      headers: object;
      file?: object;
    };
    multerIntercept.mockImplementation(async () => {
      request.file = { size: 1900 };
      return handled;
    });

    await expect(
      interceptor.intercept(contextFor(request), next),
    ).resolves.toBe(handled);

    expect(recorder.spans).toEqual([
      expect.objectContaining({
        name: 'upload.receive',
        attributes: {
          'upload.field': 'file',
          'upload.content_length': 2048,
          'upload.bytes': 1900,
        },
        ended: true,
      }),
    ]);
  });

  it('sin archivo ni content-length solo registra el campo', async () => {
    multerIntercept.mockResolvedValue(handled);

    await interceptor.intercept(contextFor({ headers: {} }), next);

    expect(recorder.spans[0].attributes).toEqual({ 'upload.field': 'file' });
  });

  it('un error de multer (archivo muy grande) queda en el span y se relanza', async () => {
    const error = new Error('File too large');
    multerIntercept.mockRejectedValue(error);

    await expect(
      interceptor.intercept(contextFor({ headers: {} }), next),
    ).rejects.toBe(error);
    expect(recorder.spans[0].exceptions).toEqual([error]);
  });
});
