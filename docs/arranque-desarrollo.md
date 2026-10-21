# Arranque estable en desarrollo

Ejecutar pnpm run start:dev. Detener primero con Ctrl+C cualquier proceso iniciado con el comando anterior.

El arranque de desarrollo usa nest-cli.dev.json y tsconfig.dev.json, con el compilador TypeScript de Nest en modo watch. La compilación y validación de tipos ocurren en un solo flujo. Ya no intervienen el watcher de salida de SWC ni su comprobador de tipos adicional. El proceso Node se inicia sin shell intermedio.

La salida de desarrollo se guarda en .dist-dev, separada de dist. Se excluyen tests, salidas de compilación, cobertura, imágenes, exportaciones de src/files y src/schema.gql. Un archivo generado por la aplicación no debe provocar otro arranque. Los templates de correo conservan su copia de assets.

Un cambio válido en un archivo TypeScript produce un reinicio. Un error de tipos muestra el diagnóstico y mantiene la última versión que estaba respondiendo; al corregirlo se inicia la versión nueva. Un cambio en la configuración de compilación requiere detener y volver a ejecutar el comando.

## Verificación realizada

- Reproducción anterior: SWC informó compilación exitosa, pero no apareció el inicio de Nest ni respondió /health durante 45 segundos.
- Nuevo arranque: /api/v1/health respondió en aproximadamente 12.6 segundos en frío, contra PostgreSQL temporal en otro puerto.
- Sin cambios y al escribir exportaciones, imágenes, tests y archivos en dist se conservó el mismo proceso de la API.
- Al añadir código TypeScript hubo exactamente un reinicio; un error de tipos no detuvo la API anterior y corregirlo produjo exactamente un reinicio adicional.
- pnpm typecheck, comprobación de tipos del tsconfig.dev.json y pnpm build completaron correctamente.

La compilación de producción y Jest conservan SWC. No se modificó la UI. La verificación del arranque utilizó PostgreSQL efímero; no utilizó la base de producción.
