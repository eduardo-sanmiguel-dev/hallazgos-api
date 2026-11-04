import { ConfigService } from '@nestjs/config';
import { once } from 'node:events';
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

import { DeploymentUpdatesService } from './deployment-updates.service.js';

describe('DeploymentUpdatesService (WebSocket y archivo reales)', () => {
  const origin = 'https://comportarte.com';
  let directory: string;
  let file: string;
  let apiFile: string;
  let http: Server;
  let service: DeploymentUpdatesService;
  let url: string;
  let clients: WebSocket[];

  const publish = async (version: unknown) => {
    const temporary = `${file}.tmp`;
    await writeFile(temporary, JSON.stringify({ version }));
    await rename(temporary, file);
  };
  const connect = () => {
    const client = new WebSocket(url, { origin });
    clients.push(client);
    return client;
  };
  const nextMessage = async (client: WebSocket) => {
    const [data] = await once(client, 'message');
    return JSON.parse(data.toString());
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hallazgos-ui-version-'));
    file = join(directory, 'ui-version.json');
    apiFile = join(directory, 'api-version.json');
    clients = [];
    http = createServer();
    service = new DeploymentUpdatesService(
      new ConfigService({
        UI_VERSION_FILE: file,
        API_VERSION_FILE: apiFile,
        frontendUrl: origin,
      }),
    );
  });

  async function start() {
    await service.attach(http);
    http.listen(0, '127.0.0.1');
    await once(http, 'listening');
    const address = http.address();
    if (typeof address === 'string' || !address) throw new Error('Sin puerto');
    url = `ws://127.0.0.1:${address.port}/api/v1/deployments/ws`;
  }

  afterEach(async () => {
    clients.forEach((client) => client.terminate());
    service.onModuleDestroy();
    if (http.listening)
      await new Promise<void>((resolve) => http.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });

  it('envía la versión persistida al conectar, incluso tras recrear la API', async () => {
    await publish('build-A');
    await start();
    expect(await nextMessage(connect())).toEqual({
      type: 'ui-version',
      version: 'build-A',
    });
  });

  it('publica un reemplazo atómico a todas las pestañas conectadas', async () => {
    await start();
    const first = connect();
    const second = connect();
    await Promise.all([once(first, 'open'), once(second, 'open')]);
    const messages = Promise.all([nextMessage(first), nextMessage(second)]);
    await publish('build-B');
    expect(await messages).toEqual([
      { type: 'ui-version', version: 'build-B' },
      { type: 'ui-version', version: 'build-B' },
    ]);
    // Una pestaña que se perdió el aviso obtiene B al reconectarse.
    expect(await nextMessage(connect())).toEqual({
      type: 'ui-version',
      version: 'build-B',
    });
  });

  it('no vuelve a avisar si se publica el mismo ID', async () => {
    await publish('build-A');
    await start();
    const client = connect();
    await nextMessage(client);
    const messages: string[] = [];
    client.on('message', (message) => messages.push(message.toString()));
    await publish('build-A');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(messages).toEqual([]);
  });

  it('ignora versiones inválidas y sigue procesando el siguiente deploy', async () => {
    await start();
    const client = connect();
    await once(client, 'open');
    const messages: string[] = [];
    client.on('message', (message) => messages.push(message.toString()));
    await publish({ invalid: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(messages).toEqual([]);
    const next = nextMessage(client);
    await publish('build-valid');
    expect((await next).version).toBe('build-valid');
  });

  it('rechaza conexiones de otro origen', async () => {
    await start();
    const client = new WebSocket(url, { origin: 'https://otro.example' });
    clients.push(client);
    const [error] = await once(client, 'error');
    expect(error.message).toContain('401');
  });

  it('no permite que el navegador publique versiones', async () => {
    await start();
    const client = connect();
    await once(client, 'open');
    const closed = once(client, 'close');
    client.send(JSON.stringify({ type: 'ui-version', version: 'fake' }));
    const [code] = await closed;
    expect(code).toBe(1008);
  });

  async function restartApi() {
    service.onModuleDestroy();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    http = createServer();
    service = new DeploymentUpdatesService(
      new ConfigService({
        UI_VERSION_FILE: file,
        API_VERSION_FILE: apiFile,
        frontendUrl: origin,
      }),
    );
    await start();
  }

  it('anuncia la versión de API aunque todavía no haya un deploy de UI', async () => {
    await writeFile(apiFile, JSON.stringify({ version: 'api-A' }));
    await start();
    expect(await nextMessage(connect())).toEqual({
      type: 'api-version',
      version: 'api-A',
    });
  });

  it('conserva el ID de build al reiniciar la API sin compilar de nuevo', async () => {
    await writeFile(apiFile, JSON.stringify({ version: 'api-A' }));
    await start();
    expect((await nextMessage(connect())).version).toBe('api-A');
    await restartApi();
    expect(await nextMessage(connect())).toEqual({
      type: 'api-version',
      version: 'api-A',
    });
  });

  it('no anuncia el siguiente build hasta que lo arranca un proceso nuevo', async () => {
    await writeFile(apiFile, JSON.stringify({ version: 'api-A' }));
    await start();
    expect((await nextMessage(connect())).version).toBe('api-A');
    await writeFile(apiFile, JSON.stringify({ version: 'api-B' }));
    expect((await nextMessage(connect())).version).toBe('api-A');
    await restartApi();
    expect(await nextMessage(connect())).toEqual({
      type: 'api-version',
      version: 'api-B',
    });
  });

  it('envía ambas versiones a una pestaña nueva y mantiene los avisos de UI', async () => {
    await writeFile(apiFile, JSON.stringify({ version: 'api-A' }));
    await publish('ui-A');
    await start();
    const client = connect();
    const firstMessages = new Promise<unknown[]>((resolve) => {
      const messages: unknown[] = [];
      client.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
        if (messages.length === 2) resolve(messages);
      });
    });
    expect(await firstMessages).toEqual([
      { type: 'ui-version', version: 'ui-A' },
      { type: 'api-version', version: 'api-A' },
    ]);
    const updated = nextMessage(client);
    await publish('ui-B');
    expect(await updated).toEqual({ type: 'ui-version', version: 'ui-B' });
  });

  it('un archivo de versión de API inválido no impide los avisos de UI', async () => {
    await writeFile(apiFile, JSON.stringify({ version: { invalid: true } }));
    await publish('ui-A');
    await start();
    expect(await nextMessage(connect())).toEqual({
      type: 'ui-version',
      version: 'ui-A',
    });
  });
});
