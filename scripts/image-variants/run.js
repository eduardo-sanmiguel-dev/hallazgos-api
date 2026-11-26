#!/usr/bin/env node
/*
 * Convierte a AVIF las fotos de evidencias e ICS que todavía no tienen
 * variante (las subidas antes de que la API las convirtiera al guardarlas).
 * Sin esto, la primera vista de cada foto antigua recibe el original.
 *
 *   pnpm build   # usa dist/, igual que la API en el VPS
 *   nice -n 19 pnpm variants:backfill
 *
 * Una conversión a la vez (~0.8 s por foto en el VPS: ~2 h para ~8 900). Se
 * puede interrumpir con Ctrl+C y volver a correr: salta las que ya existen.
 * Usa la misma carpeta que la API: data/image-variants, o IMAGE_VARIANTS_DIR
 * si producción la define (pasarla igual en el entorno).
 */
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
// La API resuelve public/ y data/ desde su carpeta de trabajo.
process.chdir(ROOT);

const { backfillImageVariants } = await import(
  pathToFileURL(
    path.join(ROOT, 'dist', 'evidences', 'image-variants-backfill.js'),
  ).href
);

const { failed } = await backfillImageVariants();
process.exitCode = failed ? 1 : 0;
