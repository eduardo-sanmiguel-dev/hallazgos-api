import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, rename, stat, unlink } from 'fs/promises';
import { join } from 'path';
import sharp, { type Sharp } from 'sharp';

import { traced } from '../shared/tracing/traced.js';

/**
 * Variantes AVIF y WebP de las fotos de evidencias e ICS.
 *
 * El original (JPG/PNG) no se toca: lo usan los correos y los PDF, que no
 * aceptan estos formatos. Al navegador que los acepta (cabecera Accept) se le
 * entrega la variante, que se genera la primera vez que se pide y se guarda
 * en data/image-variants (fuera de public: solo se llega a ella después de
 * revisar sesión y planta). Con fotos reales, AVIF pesa ~75 % menos que el
 * original y WebP ~70 %.
 */
export type ImageVariantFormat = 'avif' | 'webp';

// AVIF con esfuerzo bajo: en estas fotos es más chico y más rápido de generar
// que WebP con calidad equivalente.
const encode = (image: Sharp, format: ImageVariantFormat) =>
  format === 'avif'
    ? image.avif({ quality: 55, effort: 2 })
    : image.webp({ quality: 80 });

// Cada foto se convierte una vez: la caché de sharp solo retendría memoria y
// archivos abiertos.
sharp.cache(false);

// Conversiones a la vez por proceso: una lista con muchas fotos nuevas no
// acapara el CPU de la API.
const MAX_CONVERSIONS = 2;

/** Carpeta de las variantes (por omisión, data/image-variants del proyecto). */
export const imageVariantsDir = () =>
  process.env.IMAGE_VARIANTS_DIR ||
  join(process.cwd(), 'data', 'image-variants');

/**
 * Formato que conviene entregar según Accept, o null para el original. Los
 * WEBP subidos ya son livianos y se entregan tal cual.
 */
export const preferredImageVariant = (
  accept: string | undefined,
  filename: string,
): ImageVariantFormat | null => {
  if (!/\.(?:png|jpe?g)$/i.test(filename)) return null;
  const types = (accept || '').toLowerCase();
  if (types.includes('image/avif')) return 'avif';
  if (types.includes('image/webp')) return 'webp';
  return null;
};

const isFile = (path: string) =>
  stat(path).then(
    (info) => info.isFile(),
    () => false,
  );

export class ImageVariantCache {
  private readonly logger = new Logger(ImageVariantCache.name);
  // Una sola conversión por variante aunque lleguen varias peticiones juntas.
  private readonly pending = new Map<string, Promise<string | null>>();
  // Originales que no se pudieron convertir: no se reintenta en cada vista.
  private readonly failed = new Set<string>();
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  /**
   * Archivo a entregar: la variante si existe (o se pudo generar) y pesa
   * menos que el original; si no, el original. Nunca lanza.
   */
  async resolve(
    source: string,
    filename: string,
    format: ImageVariantFormat,
  ): Promise<string> {
    const target = join(imageVariantsDir(), `${filename}.${format}`);
    try {
      let variant = this.pending.get(target);
      if (variant === undefined) {
        variant = this.ensure(source, target, format).finally(() =>
          this.pending.delete(target),
        );
        this.pending.set(target, variant);
      }
      const path = await variant;
      if (!path) return source;
      const [original, converted] = await Promise.all([
        stat(source),
        stat(path),
      ]);
      // Una imagen diminuta (p. ej. una firma en PNG) puede crecer.
      return converted.size < original.size ? path : source;
    } catch {
      return source;
    }
  }

  private async ensure(
    source: string,
    target: string,
    format: ImageVariantFormat,
  ): Promise<string | null> {
    if (await isFile(target)) return target;
    if (this.failed.has(target)) return null;
    // Span solo cuando hay que convertir: la espera por un lugar libre
    // (MAX_CONVERSIONS) va aparte del tiempo de sharp.
    return traced('image.variant', { 'image.format': format }, async (span) => {
      const queuedAt = performance.now();
      await this.acquire();
      span.setAttribute(
        'image.queue_ms',
        Math.round(performance.now() - queuedAt),
      );
      // Nombre temporal propio: PM2 corre dos instancias y la otra puede estar
      // generando la misma variante; rename deja el archivo completo o nada.
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await mkdir(imageVariantsDir(), { recursive: true });
        // rotate(): aplica la orientación EXIF, que la variante no conserva.
        await encode(sharp(source).rotate(), format).toFile(temporary);
        await rename(temporary, target);
        return target;
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        this.failed.add(target);
        span.setAttribute('image.failed', true);
        this.logger.warn(
          `No se pudo generar la variante ${format} de ${source}: ${String(error)}`,
        );
        return null;
      } finally {
        this.release();
      }
    });
  }

  private acquire() {
    if (this.running < MAX_CONVERSIONS) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.running--;
  }
}
