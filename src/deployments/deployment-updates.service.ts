import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';

@Injectable()
export class DeploymentUpdatesService implements OnModuleDestroy {
  private readonly logger = new Logger(DeploymentUpdatesService.name);
  private server?: WebSocketServer;
  private watcher?: FSWatcher;
  private heartbeat?: ReturnType<typeof setInterval>;
  private readonly alive = new WeakSet<WebSocket>();
  private readonly file: string;
  private version?: string;
  private closed = false;

  constructor(private readonly config: ConfigService) {
    this.file =
      config.get<string>('UI_VERSION_FILE') ||
      join(homedir(), '.local', 'state', 'hallazgos', 'ui-version.json');
  }

  async attach(httpServer: Server) {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    this.server = new WebSocketServer({
      server: httpServer,
      path: '/api/v1/deployments/ws',
      maxPayload: 1024,
      perMessageDeflate: false,
      // Canal público de solo lectura: publica únicamente un ID de build.
      // El navegador no puede cambiar la versión ni enviar notificaciones.
      verifyClient: ({ origin }) =>
        origin === this.config.get<string>('frontendUrl'),
    });
    this.server.on('error', (error) => this.logger.error(error.message));
    this.server.on('connection', (client) => {
      this.alive.add(client);
      client.on('pong', () => this.alive.add(client));
      client.on('error', (error) => this.logger.warn(error.message));
      // No aceptamos mensajes de aplicación de los clientes.
      client.on('message', () => client.close(1008, 'Read-only channel'));
      if (this.version) this.send(client, this.version);
    });

    // Observar el directorio permite detectar los reemplazos atómicos (rename).
    this.watcher = watch(dirname(this.file), (_event, filename) => {
      if (!filename || filename.toString() === basename(this.file)) {
        void this.loadVersion();
      }
    });
    this.watcher.on('error', (error) => {
      this.logger.error(
        `No se pudo observar la versión de UI: ${error.message}`,
      );
    });
    await this.loadVersion();

    // Keepalive de WebSocket, sin consultas HTTP ni polling de versiones.
    // Evita el timeout de Nginx y elimina conexiones que dejaron de responder.
    this.heartbeat = setInterval(() => {
      for (const client of this.server.clients) {
        if (!this.alive.has(client)) {
          client.terminate();
          continue;
        }
        this.alive.delete(client);
        client.ping();
      }
    }, 25_000);
    this.heartbeat.unref();
  }

  private async loadVersion() {
    try {
      const message: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      if (
        !message ||
        typeof message !== 'object' ||
        !('version' in message) ||
        typeof message.version !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(message.version)
      ) {
        throw new Error('Formato de versión inválido');
      }
      if (this.closed || message.version === this.version) return;
      this.version = message.version;
      for (const client of this.server.clients) this.send(client, this.version);
      this.logger.log(`Versión de UI publicada: ${this.version}`);
    } catch (error) {
      // El primer deploy todavía puede no haber publicado ninguna versión.
      if (error?.code !== 'ENOENT') this.logger.warn(error?.message);
    }
  }

  private send(client: WebSocket, version: string) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'ui-version', version }));
    }
  }

  onModuleDestroy() {
    this.closed = true;
    this.watcher?.close();
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const client of this.server?.clients ?? []) client.terminate();
    this.server?.close();
  }
}
