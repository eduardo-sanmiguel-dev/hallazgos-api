import { readdir } from 'fs/promises';
import { join } from 'path';

import {
  evidenceImagesDir,
  ImageVariantCache,
  imageVariantsDir,
  isFile,
  preferredImageVariant,
} from './evidence-image-variants.js';

export interface BackfillSummary {
  total: number;
  created: number;
  skipped: number;
  failed: number;
}

/**
 * Convierte a AVIF las fotos subidas antes de que la API las convirtiera al
 * guardarlas (~8 900 en producción, ~0.8 s c/u). Sin esto, cada una se
 * entrega como original la primera vez que alguien la ve. Una a la vez: se
 * corre con `nice` junto a la API (scripts/image-variants/run.js). Se puede
 * interrumpir y volver a correr: salta las que ya tienen variante.
 */
export async function backfillImageVariants({
  directory = evidenceImagesDir(),
  cache = new ImageVariantCache(),
  log = (message: string) => console.log(message),
  progressEvery = 100,
}: {
  directory?: string;
  cache?: ImageVariantCache;
  log?: (message: string) => void;
  progressEvery?: number;
} = {}): Promise<BackfillSummary> {
  const names = (await readdir(directory))
    .filter((name) => preferredImageVariant('image/avif', name))
    .sort();
  const summary: BackfillSummary = {
    total: names.length,
    created: 0,
    skipped: 0,
    failed: 0,
  };
  log(`${names.length} fotos JPG/PNG en ${directory}`);
  for (const [index, name] of names.entries()) {
    if (await isFile(join(imageVariantsDir(), `${name}.avif`)))
      summary.skipped++;
    else if (await cache.prepare(join(directory, name), name, 'avif'))
      summary.created++;
    else summary.failed++;
    if ((index + 1) % progressEvery === 0)
      log(`${index + 1}/${names.length}: ${JSON.stringify(summary)}`);
  }
  log(`Terminado: ${JSON.stringify(summary)}`);
  return summary;
}
