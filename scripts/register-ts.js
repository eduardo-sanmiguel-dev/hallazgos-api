/**
 * Permite ejecutar archivos .ts de src/ directamente con Node (CLI de TypeORM
 * y de typeorm-extension). Sustituye a ts-node, cuyo resolvedor ESM no es
 * compatible con los paquetes ESM de Nest; esbuild/tsx tampoco sirven porque
 * no emiten los metadatos de decoradores que usan las entidades.
 *
 *   node --import ./scripts/register-ts.js <script> ...
 *
 * Transpila con SWC (misma configuración que .swcrc) y no revisa tipos.
 */
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformSync } from '@swc/core';

const RELATIVE_JS = /^\.{1,2}\/.*\.js$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      // En el código fuente los imports relativos apuntan al .js compilado.
      if (
        error?.code === 'ERR_MODULE_NOT_FOUND' &&
        RELATIVE_JS.test(specifier) &&
        context.parentURL?.endsWith('.ts')
      ) {
        return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !url.endsWith('.ts')) {
      return nextLoad(url, context);
    }
    const filename = fileURLToPath(url);
    const { code } = transformSync(readFileSync(filename, 'utf8'), {
      filename,
      swcrc: false,
      sourceMaps: 'inline',
      module: { type: 'es6' },
      jsc: {
        target: 'es2021',
        keepClassNames: true,
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    });
    return { format: 'module', source: code, shortCircuit: true };
  },
});
