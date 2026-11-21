import sharp from 'sharp';

/**
 * Miniaturas JPG para las celdas de imagen de los PDF (50×50 pt).
 *
 * pdfmake solo acepta JPG y PNG: una foto WebP hacía fallar el PDF completo
 * ("Unknown image format"). Además, incrustar las fotos originales (cientos
 * de KB cada una) hacía PDF de decenas de MB. A 100 px (el doble de la celda,
 * nítido al imprimir) cada miniatura pesa unos pocos KB.
 *
 * sharp trabaja en el threadpool de libuv: no bloquea el hilo principal.
 */
const THUMBNAIL_PX = 100;

// Cada foto se lee una vez por PDF: la caché de sharp solo retendría memoria
// y archivos abiertos.
sharp.cache(false);

/** Miniaturas a la vez: no acapara el threadpool (también lo usan fs y DNS). */
const MAX_CONCURRENT = 2;

/** data: URI JPG de la imagen, o null si no existe o no es una imagen. */
const pdfThumbnail = async (file: string) => {
  try {
    const jpeg = await sharp(file, { failOn: 'none' })
      .rotate()
      .resize(THUMBNAIL_PX, THUMBNAIL_PX, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      // JPG no tiene transparencia: fondo blanco, como se ve en el PDF.
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 70 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    return null;
  }
};

/**
 * Miniaturas de varias imágenes, en el mismo orden, con concurrencia
 * limitada. Cada archivo distinto se procesa una sola vez.
 */
export const pdfThumbnails = async (files: (string | null)[]) => {
  const unique = [...new Set(files.filter(Boolean))];
  const thumbnails = new Map<string, string | null>();
  let next = 0;
  const lane = async () => {
    while (next < unique.length) {
      const file = unique[next++];
      thumbnails.set(file, await pdfThumbnail(file));
    }
  };
  await Promise.all(Array.from({ length: MAX_CONCURRENT }, lane));
  return files.map((file) => (file ? thumbnails.get(file) : null));
};
