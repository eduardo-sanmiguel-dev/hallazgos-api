// Hilo de prueba de worker-pool.spec.ts (no se copia a dist: no termina en
// .worker.mjs).
import { parentPort } from 'node:worker_threads';

parentPort.on('message', ({ op, value, ms }) => {
  if (op === 'echo') parentPort.postMessage({ result: value });
  if (op === 'wait')
    setTimeout(() => parentPort.postMessage({ result: value }), ms);
  if (op === 'fail') parentPort.postMessage({ error: 'falló la tarea' });
  if (op === 'crash') process.exit(3);
  if (op === 'throw') throw new Error('error sin manejar');
  if (op === 'reply-and-exit') {
    parentPort.postMessage({ result: value });
    setTimeout(() => process.exit(0), 20);
  }
});
