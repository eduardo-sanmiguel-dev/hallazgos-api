# Revisión de seguridad

## Imágenes de hallazgos e ICS

Estado: corregido el 2026-10-20 dentro de los flujos de prioridad media.

Las URLs de imágenes exigen sesión y pertenencia a una planta del registro. La respuesta es privada y no se almacena en caché. Los correos leen sus adjuntos desde disco; la UI solicita las imágenes con su cookie de sesión. Ver docs/flujos-prioridad-media.md para los cambios y las pruebas.

La API debe recibir estas solicitudes: una configuración externa que sirva directamente la carpeta public debe aplicar la misma restricción o dejar que la API las atienda.

## Inventario de acceso: estado al 2026-10-20

- Resuelto: escrituras de usuarios, plantas, catálogos generales, CIAEL y configuración Gemba restringidas a Administradores.
- Resuelto: alcance por planta de usuarios, empleados y CIAEL (prioridad alta).
- Resuelto: alcance por planta de Gemba, inspecciones de extintores, ICS y equipos de emergencia (prioridad media). ICS comprueba la planta de los empleados relacionados.
- Pendiente de prioridad baja: revisar el alcance de los identificadores de catálogos por planta (áreas, zonas, procesos, máquinas y catálogos asociados). La escritura ya exige Administrador; esta revisión adicional comprende la pertenencia del registro a la planta.

Ver docs/flujos-criticos.md y docs/flujos-prioridad-media.md para la implementación y pruebas.

## Apagado remoto de producción (`GistSecretGuardService`)

**Riesgo:** alto (disponibilidad). **Estado:** pendiente; no se modificó (el
archivo tenía cambios previos al inicio de estas pruebas).

En producción, al arrancar y cada hora, el API descarga un gist
(`GIST_SECRET_URL`) y ejecuta `process.exit(1)` si no obtiene
`secret: "abc"`. También termina el proceso si **no hay red o GitHub falla**
(timeout, 5xx, límite de peticiones). Con pm2 el arranque vuelve a validar y
puede quedar en un ciclo de reinicios mientras dure la falla.

- Quien controle ese gist puede apagar producción.
- El secreto esperado está escrito en el código (`'abc'`).

Propuesta (si el mecanismo debe quedarse):

1. Ante errores de red o 5xx, **no** apagar: reintentar y registrar; apagar
   solo con una respuesta válida que diga explícitamente que el secreto cambió.
2. Tolerar N fallas seguidas (p. ej. 24 h) antes de apagar.
3. Mover el secreto esperado a una variable de entorno y registrar en el log
   el motivo antes de `process.exit`.

## Validación de booleanos en el cuerpo (`enableImplicitConversion`)

**Riesgo:** bajo. **Estado:** pendiente (cambia el contrato global).

El `ValidationPipe` global usa `enableImplicitConversion`: un campo
`@IsBoolean()` recibe `Boolean(valor)` antes de validarse, así que `"si"`,
`"false"` o `1` se aceptan como `true`. El UI manda booleanos reales, por lo
que hoy no afecta, pero la validación no protege a otros clientes.

Propuesta: en los DTOs con booleanos, convertir explícitamente
(`@Transform(({ obj, key }) => obj[key] === true || obj[key] === 'true')`) o
quitar la conversión implícita del pipe global y declarar `@Type(() => Number)`
donde haga falta.

## Carga de datos: `POST /rules-of-life/seed`

Actualización 2026-10-20: resuelto; la ruta ahora exige Administrador. El texto siguiente conserva el hallazgo original.

**Riesgo:** medio (integridad de datos). **Estado:** pendiente
(`it.failing` en `rules-of-life.service.spec.ts`).

Cualquier usuario con sesión puede llamarlo y cada llamada vuelve a insertar
las 18 áreas de comportamiento y las 8 reglas de vida (duplicados en los
catálogos de ICS). Propuesta: quitar el endpoint (la carga inicial ya se hizo)
o hacerlo idempotente y solo para administradores.

## Imágenes huérfanas en peticiones rechazadas

**Riesgo:** bajo (espacio en disco). **Estado:** ✅ resuelto (2026-10-20).

Multer guarda la imagen en `public/static/images/evidences` **antes** de que
el servicio valide permisos o estado. Si la petición terminaba en error (p. ej.
iniciar "en progreso" sin permiso), el archivo quedaba en disco sin hallazgo
que lo use.

Solución: interceptor global `DeleteUploadsOnErrorInterceptor`
(`src/shared/interceptors`, registrado como `APP_INTERCEPTOR` en `AppModule`).
Si la petición termina en cualquier error (400/403/404/409/500) borra los
archivos subidos (`file` o `files`) y devuelve el **mismo** error; si termina
bien no toca nada; si el borrado falla solo lo registra en el log. Aplica a
todos los endpoints con Multer (crear, cerrar e iniciar hallazgo; crear ICS) y
a los que se agreguen.

Pruebas: `delete-uploads-on-error.interceptor.spec.ts` (éxito conserva; 400,
403, 404, 409 y 500 borran; varios archivos; falla al borrar no cambia el
error) y el E2E de hallazgos contra la base de pruebas (403, 404 y 409 no
dejan archivos; la subida exitosa se conserva).
