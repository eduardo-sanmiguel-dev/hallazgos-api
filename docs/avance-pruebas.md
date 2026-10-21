# Avance de pruebas

Registro del plan de cobertura (modo autónomo, desde 2026-10-20).

Cobertura = tests unitarios (`pnpm test:cov`). Formato: sentencias / ramas /
funciones / líneas.

## Línea base (2026-10-20, antes del modo autónomo)

| Carpeta | Cobertura |
| --- | --- |
| **Global (incluye dashboard)** | **27.9 / 18.8 / 17.3 / 26.9** |
| auth | 99.3 / 88.2 / 96.6 / 100 |
| shared | 79.9 / 65.8 / 77.9 / 80.0 |
| users | 92.5 / 92.7 / 68.0 / 92.2 |
| evidences | 57.1 / 36.9 / 33.9 / 56.9 |
| equipments | 87.7 / 53.3 / 57.9 / 87.3 |
| epps | 34.4 / 17.7 / 17.6 / 33.8 |
| extinguisher-inspections | 6.1 / 4.1 / 5.6 / 5.6 |
| mail | 15.7 / 0 / 0 / 16.2 |
| manufacturing-plants | 37.8 / 8.3 / 26.3 / 35.7 |
| ciaels, employees, gemba-*, emergency-teams, ics, safety-data-files, catálogos | 0 – 23 |
| dashboard (fuera del umbral global; integración en Fase 5) | 0 |

## Bloques

### Pendientes de la ronda anterior — terminado

- **Bug corregido:** editar un usuario sin cambiar la contraseña respondía 400
  (el UI manda `password: ""`). `UpdateUserDto` trata `""` como "sin
  contraseña"; tests en `user-dtos.spec.ts` y `users.service.spec.ts`.
- Eliminados los 7 endpoints del dashboard con `userId` (`my-evidences/:userId`,
  `average-resolution-time-by-user`, `type-evidence-by-user`,
  `pending-by-seniority-by-user`, `monthly-global-trend` —incluido `isAdmin`—,
  `open-evidences`, `recent-evidences`) y sus métodos del servicio. En el UI:
  `DashboardGeneral`, `DashboardSupervisor`, `DashboardAdmin`, los 17
  componentes que solo ellos usaban, 16 funciones de `dashboard.service.ts` y
  16 interfaces. Build del UI en verde.
- Equipos `GET/PATCH/DELETE /:id`: equipo de otra planta → 404. Bug corregido:
  al editar sin planta en el body, la hora se calculaba sin planta (ahora usa
  la del equipo).
- EPP: crear con un empleado de otra planta → 404; `download/file/:employeeId`
  de otra planta → 404 e id no numérico → 400.
- Inventario de seguridad en `docs/pendientes-seguridad.md` (incluye un
  hallazgo crítico: el API no valida roles).

### P1 — `evidences` (flujos C3 correos y C5 listados/descargas) — terminado

- Cobertura: 57.1 / 36.9 / 33.9 / 56.9 → **99.2 / 86.1 / 98.0 / 99.1**
  (meta 80/70 alcanzada; umbral de la carpeta = meta).
- Tests nuevos: contenido de cada correo, filtros de `findAll` y GraphQL,
  fechas, paginación, Excel generado y leído de vuelta, PDF, controlador HTTP
  y resolver.
- Bugs corregidos: descarga PDF sin resultados respondía 500; un tipo de
  descarga desconocido (`/download/csv`) dejaba la petición colgada (ahora
  400).
- Configuración: las clases de argumentos/tipos de GraphQL (`inputs/`,
  `types/`) se excluyen de la cobertura como los DTOs.

### P2 — `epps`, `ciaels`, Gemba, `employees`, `mail`, `shared/services` — terminado

| Carpeta | Antes | Después |
| --- | --- | --- |
| epps | 34.4 / 17.7 / 17.6 / 33.8 | 97.0 / 93.7 / 90.4 / 96.8 |
| ciaels | 0 | 96.9 / 97.6 / 76.0 / 96.8 |
| gemba-walks + 4 submódulos | 0 | 100 / 96–100 / 100 / 100 |
| employees | 0 | 97.2 / 100 / 93.3 / 97.1 |
| mail | 15.7 / 0 / 0 / 16.2 | 100 |
| shared | 82.8 / 67.1 / 81.1 / 82.9 | 96.1 / 88.2 / 92.6 / 97.9 |
| **Global** | **33.1 / 28.2 / 23.1 / 32.1** | **58.7 / 54.9 / 44.8 / 58.0** |

Bugs corregidos (contenidos, con test):

- EPP: descargar el formato de un empleado sin EPP respondía 500 (ahora 404);
  `validate-delivery-frequency` sin ids llegaba como `NaN` a la base (ahora
  400).
- EPP (seguridad, mismo tipo que lo aprobado): `GET /epps/:id`,
  `DELETE /epps/history/:id`, `validate-delivery-frequency` y los equipos al
  crear una entrega ahora se limitan a las plantas del usuario (404).
- CIAEL: el agente del accidente se validaba en el catálogo de partes del
  cuerpo; sin máquina respondía 404 (ahora 400); `GET /ciaels/:id`
  inexistente respondía 200 sin cuerpo (ahora 404).
- Gemba: zonas y conceptos con nombre de solo espacios se guardaban vacíos
  (ahora 400).
- Empleados: un `PATCH` parcial asignaba **cualquier** área/puesto/género
  (TypeORM ignora `id: undefined`) y sin plantas respondía 500; ahora
  conserva lo no enviado. Un área/puesto/género inexistente responde 404 en
  lugar de guardarse vacío. La lista con una planta ajena devolvía los
  empleados de esa planta (ahora vacío).
- Correos: la ruta local de imágenes se armaba sin separador
  (`dist/mail../../../public`). En Linux no existe: el correo de **solución
  con foto** fallaba en producción (queda en el log como `No se pudo enviar el
  correo "solution"`; conviene revisarlo en los logs de producción).

Utilidades de prueba nuevas: `createHttpTestApp` (contrato HTTP con los mismos
pipes y filtros que `main.ts`), `describeCrudContract` (CRUD estándar),
`binaryParser` (descargas).

### P3 — extintores, HDS, plantas y CRUD de configuración — terminado

| Carpeta | Antes | Después |
| --- | --- | --- |
| extinguisher-inspections | 6.1 / 4.1 / 5.6 / 5.6 | 97.9 / 81.6 / 97.4 / 98.5 |
| safety-data-files | 0 | 84.9 / 100 / 50 / 83.3 (stubs) |
| manufacturing-plants | 37.8 / 8.3 / 26.3 / 35.7 | 100 |
| areas, zones, processes, main-types, secondary-types | 0 – 23 | 100 |
| ics / emergency-teams | 0 | 96.5 / 88 / 86.7 / 96.3 · 98.2 / 100 / 92.3 / 98.1 |
| catálogos CIAEL (13) | 0 | 70–77 / 100 / 42–50 / 67–75 (solo quedan stubs) |
| dashboard.controller | 0 | 100 |
| users / equipments / health (controladores) | 0 | 100 |

Bugs corregidos (contenidos, con test):

- Extintores: "hoy" se calculaba en UTC; en México después de las 18:00 se
  rechazaban fechas de hoy como pasadas (ahora usa el día de la planta).
- Plantas: la latitud se validaba como longitud (aceptaba 120°).
- Áreas: nombre de solo espacios se guardaba vacío (ahora 400).
- Zonas, procesos y tipos secundarios: un `PATCH` sin planta/tipo principal
  asignaba **cualquier** planta/tipo (TypeORM ignora `id: undefined`); zonas
  además quitaba el área. Ahora se conserva lo actual (`areaId: null` sigue
  quitando el área, como lo manda el UI).
- Procesos: `findAllByManufacturingPlantNames` respondía 500 sin nombres y
  cortaba nombres con " - ". Mensajes 404 de zona/proceso decían "Planta".
- ICS: más personas incorrectas que el total guardaba valores negativos
  (ahora 400).

Umbrales (jest.config.js):

- Carpetas con lógica de negocio (24): meta 85 / 70 / 70 / 85, alcanzada.
- `auth`, `shared/middlewares`, `evidences`: sus metas propias, alcanzadas.
- El umbral "global" de Jest solo mide lo que no tiene carpeta (casi todo
  stubs de catálogos): piso real 79 / 70 / 56 / 76.
- **Meta global del plan (todo menos `dashboard.service`)**:
  `pnpm test:cov:goal` → **95.7 % sentencias / 92.3 % ramas** (meta 80/70).
- `cluster.service.ts` excluido de la cobertura: solo se usa en un bloque
  comentado de `main.ts` (propuesta: borrarlo).

Estabilidad: la descarga del Excel de extintores por HTTP fallaba de forma
intermitente (ECONNRESET) con la suite en paralelo; las pruebas de contenido
ahora llaman al controlador directamente y la app de prueba escucha una sola
vez. 3 corridas completas seguidas en verde.

### Fase 4 — E2E de endpoints críticos — terminado

App completa (`AppModule`, middlewares reales de app key y JWT) contra la base
aislada `hallazgos_test` (`pnpm test:db`; ver `test/db/README.md`).

| Suite | Cubre |
| --- | --- |
| auth y usuarios (19) | login 201/401/400, app key 400, sin token/token alterado 401, `/health` público, check-token, forgot-password uniforme; usuarios 201/400/404, editar sin contraseña conserva la actual |
| hallazgos (10) | crear 201/400/401, planta ajena 404, iniciar/cerrar con reglas de quién (403), estados finales (409), comentar, cancelar, reasignar (400), GraphQL por planta, descargas (200/400) |
| EPP y equipos (11) | entrega, frecuencia, formato Excel, empleado/equipo/lista de otra planta (404), validación (400), sin sesión (401) |
| CIAEL y 13 catálogos (18) | catálogos (solo activos, por planta, 401), alta completa, máquina nueva, 400/404 |
| Gemba y extintores (7) | flujo de observador completo (acceso 403, comprobante, conceptos incompletos 400, evento repetido 400) e inspecciones (Excel, fechas pasadas 400, 404) |

Bug corregido: una entrega de EPP sin equipos se aceptaba (ahora 400).

### Fase 5 — Integración del dashboard — terminado

`test/db/dashboard.int-spec.ts` ejecuta el SQL real de `dashboard.service`:
valores exactos (resumen global, estatus por filtros, por área, por
responsable, abiertos vs. cerrados), los 28 endpoints con y sin filtros,
validación de fechas, el respaldo a supervisores y la regla de tipos
restringidos de `glora@hadainternational.com`.

- Cobertura de `dashboard.service` por integración
  (`pnpm test:db:cov`): **93.5 / 76.3 / 90.7 / 94.0** (umbral 90/70/90/90).
- Bug de seguridad corregido: `historical-by-month` mezclaba todas las plantas.
- Cambio mínimo para probar: con `NODE_ENV=test` el esquema GraphQL se genera
  en memoria (no reescribe `src/schema.gql`).

### Tarea adicional — imágenes de peticiones rechazadas — terminado

- Interceptor global `DeleteUploadsOnErrorInterceptor`: si una petición con
  Multer termina en error borra lo subido y devuelve el mismo error; si el
  borrado falla solo lo registra. 13 pruebas propias (100 / 90) y un E2E real
  (403, 404 y 409 no dejan archivos; la subida exitosa se conserva).
  Verificado que el E2E falla sin el interceptor.
- `shared/interceptors` agregado a las carpetas con umbral (85/70/70/85).
- `test:db`: desde el commit que agregó `@nestjs/observe`/OpenTelemetry el
  proceso de Jest se caía de forma intermitente (código nativo `0xC0000409`)
  al encadenar suites, también sin el interceptor. Ahora cada suite corre en
  su propio proceso (`workerIdleMemoryLimit`): 7 corridas seguidas en verde.
  `@nestjs/observe` (solo ESM) se sustituye en estas pruebas.

## Resultado final (2026-10-20)

| Métrica | Inicial | Final |
| --- | --- | --- |
| Tests unitarios | 375 | **1009** |
| Tests e2e (sin BD, `test:e2e`) | 17 | **29** |
| Tests con BD (`test:db`) | 0 | **136** |
| **Global sin dashboard.service** (`test:cov:goal`) | ≈ 33 / 28 | **95.7 % sentencias / 92.3 % ramas** |
| Global incluyendo dashboard (solo unitarias) | 27.9 / 18.8 / 17.3 / 26.9 | 79.3 / 70.7 / 72.6 / 78.9 |
| auth | 99.3 / 88.2 / 96.6 / 100 | 99.3 / 88.2 / 96.6 / 100 (meta 90/85) |
| shared/middlewares | 100 | 100 (meta 85/80) |
| evidences | 57.1 / 36.9 / 33.9 / 56.9 | 99.2 / 86.1 / 98.0 / 99.1 (meta 80/70) |
| dashboard.service (integración) | 0 | 93.5 / 76.3 / 90.7 / 94.0 |
| Carpetas con lógica de negocio (24) | 0 – 92 | todas ≥ 85 % sentencias |

Todo en verde: unit, e2e del API, `test:db`, `typecheck`, `lint` (sin
errores; 1 aviso previo), build del API y del UI, e2e del UI (Playwright 29).

## Decisiones pendientes

Cada `it.failing` es un bug documentado que no se corrigió porque cambia
reglas, permisos o contrato.

| # | Prueba (`it.failing`) | Qué pasa hoy | Propuesta |
| --- | --- | --- | --- |
| 1 | `test/db/auth-users.db-spec.ts`: "un usuario General no puede hacerse Administrador (403)" | El API no valida roles: un General puede cambiar su rol, la contraseña de otros o crear/desactivar usuarios y catálogos. | Guard de roles (`@Roles`) en escrituras de usuarios, plantas y catálogos. **Prioridad alta.** |
| 2 | `src/rules-of-life/rules-of-life.service.spec.ts`: "volver a ejecutarlo no duplica datos" | `POST /rules-of-life/seed` está expuesto y duplica áreas y reglas en cada llamada. | Quitar el endpoint o hacerlo idempotente y solo para administradores. |
| 3 | `src/ciael-catalogs.spec.ts`: "create guarda el cuerpo recibido" (tareas asociadas, mecanismos, partes del cuerpo) | `POST` usa `repository.create` (no guarda) y además su DTO está vacío (cualquier campo da 400). | Decidir si esos `POST` deben existir; si sí, DTO con `name` y `save`. |

Otras decisiones (sin prueba que falle):

- **Endpoints stub** que responden 200 sin hacer nada (generados por Nest):
  `PATCH/DELETE /epps/:id`, `PATCH /evidences/:id`, `PATCH/DELETE /ciaels/:id`,
  `POST /ciaels/seed`, `POST /employees/seed`, `POST /equipments/seed`,
  `GET/PATCH/DELETE` de HDS por id, y `findOne/update/remove` de los 13
  catálogos CIAEL y de países/géneros. Propuesta: eliminarlos o implementarlos.
- **Booleanos en el cuerpo**: `enableImplicitConversion` convierte cualquier
  texto en `true` antes de validar (ver pendientes de seguridad).
- **`cluster.service.ts`**: sin uso; propuesta: borrarlo.
- **Inventario de seguridad** (`docs/pendientes-seguridad.md`): recursos por id
  sin validar planta en usuarios, empleados, CIAEL, extintores, Gemba,
  brigadas, ICS y catálogos por planta; apagado remoto (gist); imágenes
  públicas; imágenes huérfanas.

## Ramas no forzadas

- Clases GraphQL (`inputs/`, `types/`): excluidas como los DTOs.
- Metadatos de decoradores que SWC agrega en los controladores (ramas
  `typeof X === 'undefined'`): `evidences.controller` 40 %, `auth.controller`
  50 % de ramas; no son lógica.
- `evidences.service`: `return undefined` final de `buildCreatedAtFilter`
  (inalcanzable) y el stub `update`.
- `extinguisher-inspections.controller`: `match` nulo tras un filtro que ya lo
  descarta y estilo `bold` indefinido (la plantilla siempre lo trae).
- `epps.controller`: callback de error de `res.sendFile`.
- `dashboard.service`: validaciones defensivas (`!manufacturingPlantId`) que
  por HTTP nunca se alcanzan (el `UserPlantPipe` ya las garantiza).
- Stubs de catálogos (ver arriba): funciones sin probar a propósito.

## Meta razonable global — alcanzada

Se añadió dashboard.service.spec.ts con 201 pruebas de validación, alcance y transformaciones. Resultado: 1,327 pruebas / 74 suites; cobertura 96.88 / 91.99 / 91.23 / 96.95 (sentencias / ramas / funciones / líneas), manteniendo las exclusiones previas.

El verificador global ahora incluye dashboard.service.ts y exige 85 / 80 / 85 / 85. GitHub Actions lo ejecuta después de las pruebas unitarias y bloquea el deploy si falla. Los tests SQL permanecen en el job independiente con PostgreSQL temporal. Ver docs/meta-cobertura.md.
