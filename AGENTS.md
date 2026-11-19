# AGENTS.md — hallazgos-api

Reglas para cambiar código sin romper lo que no se ve a simple vista. Cómo
levantar, variables y despliegue: `README.md`.

## Qué es

API REST de ComportArte (HADA): seguridad industrial en plantas de México y
Colombia (hallazgos, EPP, extintores, Gemba Walk, CIAEL, ICS, HDS, catálogos,
dashboard). Su única cliente es [hallazgos-ui](../hallazgos-ui). **La API es la
autoridad de permisos**; la UI solo muestra u oculta acciones.

Vocabulario: _hallazgo_ = `evidence`, _planta_ = `manufacturingPlant`. Roles y
estados en `src/shared/constants`. Código en inglés, textos al usuario en
español.

## Stack: lo que cambia cómo se escribe el código

- **NestJS 12 en ESM**: los imports relativos llevan `.js`
  (`'./zones.service.js'`); no hay alias de rutas.
- **TypeScript con `strict: false`**, pero `noUnusedLocals`,
  `noUnusedParameters` y `verbatimModuleSyntax` (tipos con `import type`).
- **SWC compila sin revisar tipos**: los revisa `pnpm typecheck` (TS 7).
- **TypeORM 0.3 + PostgreSQL 18.6**, sin `synchronize`; las migraciones corren
  al arrancar.
- **pnpm 12**. ESLint marca como error las promesas sin `await`/`.catch`.

## Dónde mirar

- Un módulo Nest por dominio en `src/<dominio>/`. **Ejemplo canónico: `src/zones/`**
  (y `zones.service.spec.ts` para pruebas).
- `src/evidences/` es el dominio con más reglas; `src/shared/` tiene
  middlewares, pipes, guards, errores y utilidades.
- `src/mail-worker.ts` y `src/mail-admin.ts` son procesos aparte de la API.

## Reglas que no se deben romper

1. **Usuario en sesión solo desde `RequestContextService`** (`user`, `userId`,
   `isAdmin`, `manufacturingPlantIds`). Los servicios son singleton: nunca
   guardar el usuario en una propiedad. Fuera de una petición HTTP (cron,
   mail-worker) no hay contexto y lanza error.
2. **Todo dato operativo se limita a las plantas del usuario.** Un
   `manufacturingPlantId` del cliente pasa por `UserPlantPipe` /
   `OptionalUserPlantPipe` o `requestContext.assertManufacturingPlant()`. Un
   registro de otra planta responde **404, no 403**.
3. **Escrituras de catálogos: `@UseGuards(AdminGuard)`.** Listar inactivos con
   `catalogIncludesInactive(query.includeInactive)` (403 a no administradores).
4. **Errores: excepciones de Nest con mensaje en español para el usuario
   final.** El `code` de la respuesta (`ERROR_CODES`) es contrato con la UI; el
   texto puede cambiar. Para un caso que la UI deba distinguir:
   `apiError(mensaje, ERROR_CODES.x)`. Una violación única de Postgres
   (`'23505'`) se traduce a `ConflictException` (ver `zones.service.ts`).
5. **DTOs:** el `ValidationPipe` global usa `whitelist` y
   `forbidNonWhitelisted`: **una propiedad que no está en el DTO responde
   400**. Cada campo validado necesita etiqueta en
   `src/shared/errors/field-labels.ts` (su spec falla si falta).
6. **Orden con lista blanca:** `IsSortColumn(X_SORT_COLUMNS)` +
   `buildFindOrder`; nunca interpolar `orderBy` en SQL. Paginación con
   `findPaginated` → `{ data, count }`; `limit = -1` trae todo.
7. **`@Idempotent()` en todo endpoint que cree registros o mande correos.**
8. **Correo solo por el outbox:** `mailService.withOutbox(manager, ...)` dentro
   de la transacción; lo envía `mail-worker`. Fuera de `withOutbox`,
   `MailService` lanza error a propósito.
9. **Excel:** llenar una plantilla de `src/files/` → `xlsx-populate` (conserva
   formato). Reporte nuevo, imágenes o streaming → `exceljs`.
10. **Fechas: no confiar en la zona del proceso.** Las columnas
    `timestamp without time zone` guardan hora de pared, y esa zona cambió en
    la historia de producción (UTC hasta ~2026-02-25, luego México; Bogotá en
    algunas columnas de plantas de Colombia). Fechas de hallazgos:
    `src/evidences/evidence-storage-timezones.ts`. Cálculos:
    `src/shared/utils/timezone.ts` con zona IANA explícita. Columnas nuevas:
    `timestamptz`.
11. **Archivos del usuario:** rutas con `safe-file-path`, imágenes con
    `image-upload` (si la petición falla, un interceptor global las borra).
12. **Migraciones:** SQL a mano, idempotente (`IF NOT EXISTS`), con `down` y un
    comentario del porqué. **Compatibles con el código anterior**: PM2 recarga
    dos instancias de una en una y la vieja atiende con el esquema nuevo. Nunca
    editar una migración desplegada.
13. Las listas de correos de `evidence-permissions.ts` son reglas de negocio y
    solo viven en la API; la UI recibe `evidencePermissions` ya calculado.

## Recetas

**Endpoint nuevo.** DTO (+ etiquetas) → servicio que filtra por planta →
controller con `AdminGuard` / `UserPlantPipe` / `@Idempotent()` según aplique →
pruebas. Si cambia la respuesta, actualizar `hallazgos-ui/app/_interfaces/`.

**Catálogo nuevo.** Copiar la forma de `src/zones/` → registrar en
`app.module.ts` → migración → si se activa/desactiva, agregarlo al mapa
`catalogs` de `catalog-lifecycle.service.ts`.

## Pruebas: obligatorias en cada cambio

- **Cobertura unitaria al 100 %** (`jest.config.js`): una línea sin probar
  rompe `pnpm test:cov`, el push y CI. Utilidades en `test/utils`:
  `createServiceTestingModule`, `mockProvider`, `buildUser`, `runAsUser`.
- Peculiaridades de SWC en cobertura:
  - un `export` que nadie importa aparece sin cubrir (quitar el `export`);
  - un parámetro tipado `Express.Multer.File` genera 3 ramas fantasma (usar
    `Express.Multer.File | undefined`);
  - para espiar `fs/promises`, espiar el import por defecto.
- `pnpm test:db`: AppModule contra `hallazgos_test` (el nombre debe terminar
  en `_test`), para SQL, migraciones, transacciones y carreras. Una sola app
  por archivo.
- En Windows, Git Bash no pasa `TZ` a Node: usar `cross-env TZ=...`.

## Antes de dar algo por terminado

```bash
pnpm typecheck && pnpm lint && pnpm test:cov
pnpm test:e2e      # si cambió un controller o la forma de una respuesta
pnpm test:db       # si cambió SQL, una migración o una transacción
```

## Cuidado

- **Un push a `main` despliega a producción.** No hacer commit ni push si no lo
  piden.
- No leer ni modificar `.env.*` reales. `MAIL_OUTBOX_KEY` nunca cambia
  (descifra los correos en cola).
- `data/hds/` y `public/static/images/evidences/` son datos reales.
- Las skills de `.claude/skills` y `.agents/skills` son genéricas; este archivo
  manda sobre ellas.
