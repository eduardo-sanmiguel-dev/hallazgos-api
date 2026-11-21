import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Redis } from 'ioredis';

/**
 * Caché de respuestas en Redis (CACHE_REDIS_URL), compartido por los procesos
 * de PM2. Es un Redis aparte del de la cola de correos: este descarta claves
 * cuando se llena (volatile-lru, sin persistencia) y aquel no debe perder
 * nada (noeviction).
 *
 * Invalidación por generación: cada espacio (`catalogs`, `dashboard`) tiene un
 * contador `cache:gen:<espacio>` que forma parte de cada llave. Una escritura
 * lo incrementa (después del commit, ver CacheInvalidationSubscriber) y todo
 * lo guardado antes deja de leerse; vence solo por su TTL. Una lectura que
 * empezó antes del commit guarda bajo la generación vieja: nunca se sirve.
 *
 * Si Redis no está configurado o falla, se consulta la base como siempre.
 */
export type CacheNamespace = 'catalogs' | 'dashboard';

/** TTL de respaldo (segundos), por si alguna escritura no se ve. */
const TTL: Record<CacheNamespace, number> = {
  catalogs: 10 * 60,
  // Algunas gráficas dependen de la fecha actual (vencidos, mes en curso).
  dashboard: 5 * 60,
};

/** Respuestas más grandes no se guardan (no vale la pena moverlas). */
const MAX_VALUE_BYTES = 2 * 1024 * 1024;

/** Un aviso por minuto como máximo si Redis no responde. */
const WARN_INTERVAL_MS = 60_000;

/** Cliente mínimo que usa el caché (ioredis o uno de prueba). */
export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: 'EX',
    seconds: number,
  ): Promise<unknown>;
  incr(key: string): Promise<number>;
  quit(): Promise<unknown>;
}

// Cliente propio (pruebas); en la app no hay proveedor y se usa CACHE_REDIS_URL.
const CACHE_CLIENT = Symbol('CACHE_CLIENT');

/** JSON con las llaves ordenadas: el mismo filtro da la misma llave. */
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

export const cacheKeyHash = (key: unknown) =>
  createHash('sha256').update(stableJson(key)).digest('hex').slice(0, 32);

/**
 * Conexión de producción. Sin cola mientras está desconectado y con tiempo
 * límite corto: si Redis no responde, la petición sigue contra la base.
 */
export const createCacheRedis = (url: string, onError: (e: Error) => void) => {
  const redis = new Redis(url, {
    connectionName: 'api-cache',
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: 250,
  });
  redis.on('error', onError);
  return redis;
};

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly client: CacheClient | null;
  private lastWarning = 0;

  constructor(
    config: ConfigService,
    @Optional() @Inject(CACHE_CLIENT) client?: CacheClient,
  ) {
    const url = config.get<string>('CACHE_REDIS_URL');
    this.client =
      client ??
      (url
        ? createCacheRedis(url, (error) => this.warn('conectar', error))
        : null);
  }

  /**
   * Valor guardado para `key` en el espacio, o el de `load` (que se guarda).
   * Solo para respuestas HTTP: lo que sale del caché pasó por JSON (fechas
   * como texto), igual que lo que recibe el cliente.
   */
  async remember<T>(
    namespace: CacheNamespace,
    key: unknown,
    load: () => Promise<T>,
  ): Promise<T> {
    if (!this.client) return load();

    let dataKey: string;
    try {
      const generation =
        (await this.client.get(`cache:gen:${namespace}`)) ?? '0';
      dataKey = `cache:${namespace}:${generation}:${cacheKeyHash(key)}`;
      const cached = await this.client.get(dataKey);
      if (cached !== null) return JSON.parse(cached) as T;
    } catch (error) {
      this.warn('leer', error);
      return load();
    }

    const value = await load();
    const json = JSON.stringify(value);
    if (json !== undefined && json.length <= MAX_VALUE_BYTES) {
      // Sin esperar: la respuesta no depende de que se guarde.
      this.client
        .set(dataKey, json, 'EX', TTL[namespace])
        .catch((error) => this.warn('guardar', error));
    }
    return value;
  }

  /** Deja de servir lo guardado en esos espacios. */
  async invalidate(namespaces: Iterable<CacheNamespace>) {
    if (!this.client) return;
    await Promise.all(
      [...new Set(namespaces)].map((namespace) =>
        this.client
          .incr(`cache:gen:${namespace}`)
          .catch((error) => this.warn('invalidar', error)),
      ),
    );
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => undefined);
  }

  private warn(action: string, error: Error) {
    const now = Date.now();
    if (now - this.lastWarning < WARN_INTERVAL_MS) return;
    this.lastWarning = now;
    this.logger.warn(
      `Caché Redis no disponible al ${action} (se consulta la base): ${error.message}`,
    );
  }
}
