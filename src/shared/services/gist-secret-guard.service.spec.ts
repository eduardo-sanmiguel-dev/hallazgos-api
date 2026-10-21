import { ConfigService } from '@nestjs/config';

import { GistSecretGuardService } from './gist-secret-guard.service.js';

const GIST_URL = 'https://gist.test/secret.json';

describe('GistSecretGuardService', () => {
  let exit: jest.SpyInstance;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  const guard = (
    environment = 'production',
    url: string | undefined = GIST_URL,
  ) =>
    new GistSecretGuardService({
      get: (key: string) =>
        ({ environment, 'security.gistSecretUrl': url })[key],
    } as unknown as ConfigService);

  const respond = (payload: unknown, ok = true) =>
    fetchMock.mockResolvedValue({ ok, json: async () => payload });

  beforeEach(() => {
    // process.exit simulado: el proceso de pruebas no termina.
    exit = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    exit.mockRestore();
    global.fetch = originalFetch;
  });

  it('fuera de producción no consulta nada (al iniciar ni cada hora)', async () => {
    const service = guard('development');

    await service.onApplicationBootstrap();
    await service.validateHourlySecret();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it.each([
    ['con { secret }', { secret: 'abc' }],
    [
      'con el formato de la API de gists',
      {
        files: {
          'a.json': { content: '' },
          'b.json': { content: '{"secret":"abc"}' },
        },
      },
    ],
  ])('el secreto correcto %s deja la app arriba', async (_c, payload) => {
    respond(payload);

    await guard().onApplicationBootstrap();
    await guard().validateHourlySecret();

    expect(fetchMock).toHaveBeenCalledWith(GIST_URL, {
      headers: { Accept: 'application/json' },
    });
    expect(exit).not.toHaveBeenCalled();
  });

  it('sin URL configurada termina el proceso', async () => {
    await guard('production', '').onApplicationBootstrap();

    expect(exit).toHaveBeenCalledWith(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['la respuesta no es 2xx', () => respond({ secret: 'abc' }, false)],
    ['el secreto es otro', () => respond({ secret: 'otro' })],
    ['el secreto viene vacío', () => respond({ secret: null })],
    [
      'no hay red (fetch falla)',
      () => fetchMock.mockRejectedValue(new Error('ENOTFOUND')),
    ],
    ['el gist no tiene archivos', () => respond({ files: {} })],
    [
      'ningún archivo tiene contenido',
      () => respond({ files: { a: { content: ' ' } } }),
    ],
    [
      'el contenido no es JSON',
      () => respond({ files: { a: { content: 'hola' } } }),
    ],
    [
      'el JSON no tiene secret',
      () => respond({ files: { a: { content: '{"x":1}' } } }),
    ],
    ['la respuesta no es un objeto', () => respond('texto')],
  ])('termina el proceso si %s', async (_c, arrange) => {
    arrange();

    await guard().validateHourlySecret();

    expect(exit).toHaveBeenCalledWith(1);
  });
});
