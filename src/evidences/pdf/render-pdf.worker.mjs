// Hilo de trabajo (worker_threads) que arma los PDF con pdfmake.
//
// Armar un PDF de cientos de filas ocupa el CPU por segundos: en el hilo
// principal, la API dejaba de responder a todos mientras tanto. Aquí corre
// aparte (ver WorkerPool y PdfRendererService).
//
// JavaScript plano (no TypeScript): Node lo carga tal cual en el build, en
// modo dev y en Jest. nest-cli.json lo copia a dist como asset.
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { parentPort } from 'node:worker_threads';

// pdfmake es CommonJS y su fuente se resuelve como archivo del paquete.
const require = createRequire(import.meta.url);
const pdfMake = require('pdfmake');
const fonts = require('pdfmake/fonts/Roboto');

const FONTS_DIR = dirname(require.resolve('pdfmake/fonts/Roboto'));

pdfMake.setFonts(fonts);
// Desde pdfmake 0.3 el servidor puede leer archivos locales y descargar URLs.
// Los reportes solo usan imágenes data: y las fuentes del paquete: se bloquea
// lo demás.
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy((path) =>
  resolve(path).startsWith(FONTS_DIR + sep),
);

// Una tarea a la vez por hilo: el pool no manda otra hasta recibir respuesta.
parentPort.on('message', async (docDefinition) => {
  try {
    const pdf = await pdfMake.createPdf(docDefinition).getBuffer();
    // Copia propia del PDF para transferirla sin duplicarla en memoria (el
    // Buffer puede compartir su ArrayBuffer con otros).
    const bytes = pdf.buffer.slice(
      pdf.byteOffset,
      pdf.byteOffset + pdf.byteLength,
    );
    parentPort.postMessage({ result: bytes }, [bytes]);
  } catch (error) {
    parentPort.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
