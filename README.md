# ComportArte API

API de ComportArte (HADA): hallazgos de seguridad, EPP, inspección de extintores,
Gemba Walk, CIAEL, colaboradores, catálogos y dashboards. La consume
[hallazgos-ui](../hallazgos-ui) y es la autoridad de autenticación y permisos.

- **NestJS 12** sobre Node, en ESM y TypeScript.
- **PostgreSQL 18.6** con TypeORM; las migraciones corren al arrancar.
- **Redis + BullMQ** para la cola de correos (outbox transaccional).
- **OpenObserve** para logs y trazas, solo en producción.
- **PM2 en cluster** en producción, más un worker de correo aparte.

## Requisitos

- Node 24 o superior (CI usa 24; producción, 26) y **pnpm 12.16.1** (`packageManager`).
- PostgreSQL local con una base de desarrollo.
- Redis, solo si se van a enviar correos en local.
- Docker Desktop en modo Linux para el hook de `git push` (ver [Validaciones antes del push](#validaciones-antes-del-push)).

## Puesta en marcha

```bash
pnpm install --frozen-lockfile
cp .env.example .env.development   # completar los valores
pnpm start:dev                     # http://localhost:4000/api/v1
```

- Las migraciones pendientes se aplican solas al arrancar (`migrationsRun`).
- `GET /api/v1/health` es público y sirve para comprobar que la API responde.
- Con `E2E_EMAIL` y `E2E_PASSWORD` definidas, al arrancar en desarrollo se crea
  el usuario que usan las pruebas e2e de la UI.
- Abrir la UI en `http://localhost:3000`: `127.0.0.1:3000` es otro origen y
  CORS lo rechaza (ver `WHITE_LIST_DOMAINS`).

## Variables de entorno

Se leen de `.env.<NODE_ENV>` (`.env.development`, `.env.production`) y se
validan con Joi al arrancar: si falta una obligatoria, la API no inicia.
`.env.example` trae todas con valores de ejemplo.

| Variable                                                      | Oblig.   | Para qué                                                                                                    |
| ------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                    | Sí       | La fijan los scripts (`start:dev`, `start`, PM2).                                                           |
| `PORT`                                                        | Sí       | Puerto HTTP (4000).                                                                                         |
| `APP_KEY`                                                     | Sí       | Clave que la UI envía en `x-app-key`; sin ella, 400.                                                        |
| `WHITE_LIST_DOMAINS`                                          | Sí       | Orígenes permitidos por CORS, separados por coma.                                                           |
| `FRONTEND_URL`                                                | Sí       | URL pública de la UI (enlaces de los correos).                                                              |
| `JWT_SECRET_KEY`                                              | Sí       | Firma de los tokens de sesión.                                                                              |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` | Sí       | PostgreSQL.                                                                                                 |
| `DB_POOL_MAX` / `DB_POOL_MIN` / `DB_POOL_IDLE_MS`             | No       | Pool de conexiones: 10 / 2 / 300000 ms.                                                                     |
| `MAIL_HOST`, `MAIL_USER`, `MAIL_PASSWORD`                     | Sí       | SMTP.                                                                                                       |
| `MAIL_PORT`                                                   | No       | Puerto SMTP (587).                                                                                          |
| `MAIL_OUTBOX_KEY`                                             | En prod. | Cifra los correos guardados; mínimo 32 caracteres y **no debe cambiar**.                                    |
| `MAIL_REDIS_URL`                                              | No       | Redis de la cola de correos.                                                                                |
| `MAIL_OUTBOX_DIR`                                             | No       | Carpeta de los adjuntos de los correos en cola.                                                             |
| `GIST_SECRET_URL`                                             | Sí       | Interruptor remoto: en producción se comprueba al arrancar y cada hora, y la API se detiene si no coincide. |
| `OBSERVE_ENDPOINT`, `OBSERVE_AUTH_HEADER`, `OBSERVE_STREAM`   | No       | Logs y trazas a OpenObserve; solo con `NODE_ENV=production`.                                                |
| `UI_VERSION_FILE` / `API_VERSION_FILE`                        | No       | Rutas de las versiones publicadas (ver [Versión de despliegue](#versión-de-despliegue-y-recarga-de-la-ui)). |
| `E2E_EMAIL`, `E2E_PASSWORD`                                   | No       | Usuario de pruebas e2e de la UI; solo desarrollo.                                                           |

## Cómo está armada

- **Prefijo** `/api/v1` para todas las rutas, salvo los archivos estáticos.
- **Middlewares, en orden:** contexto de la petición → `x-app-key` → JWT. El JWT
  llega en la cookie HttpOnly `token` o en `Authorization: Bearer`.
- **Usuario en sesión:** se carga con **una sola consulta** (sus plantas activas
  son sus permisos) y vive en `RequestContextService`. Los servicios leen de ahí;
  nunca guardan el usuario en propiedades.
- **Permisos por planta:** cada consulta se limita a las plantas del usuario. Un
  registro de otra planta responde 404, como si no existiera.
- **Idempotencia:** las acciones marcadas con `@Idempotent()` aceptan la cabecera
  `Idempotency-Key`; un reintento con la misma clave devuelve la respuesta
  original en lugar de duplicar el registro.
- **Correos:** se guardan cifrados en la misma transacción que el cambio (outbox)
  y los envía `mail-worker` mediante BullMQ. Si falla el correo, el cambio no se
  pierde ni se duplica. Una foto que falte en disco no bloquea el correo.
- **Imágenes de evidencias:** `/static/images/evidences/*` exige sesión y planta.
- **Pool de PostgreSQL:** conexiones de larga vida (`config/db-pool.config.ts`),
  identificadas como `comportarte-api` en `pg_stat_activity`.

Estructura: un módulo de Nest por dominio en `src/<módulo>/`
(controller, service, `entities/`, `dto/` y sus `*.spec.ts`). Lo compartido está
en `src/shared/` y la configuración en `src/config/`.

## Base de datos

```bash
pnpm migration:run      # aplicar migraciones (desarrollo)
pnpm migration:revert   # revertir la última
pnpm seed:dev           # datos de catálogos en desarrollo
```

En producción las migraciones se aplican al arrancar; existen `migration:run:prod`
y `migration:revert:prod` para casos manuales.

## Pruebas

```bash
pnpm test          # unitarias (Jest, dependencias simuladas)
pnpm test:cov      # unitarias con cobertura
pnpm test:e2e      # contratos HTTP con servicios simulados
pnpm test:db       # e2e contra PostgreSQL real (base aislada *_test)
pnpm typecheck     # TypeScript 7; typecheck:ts6 con TypeScript 6
pnpm lint
```

`test:db` crea y recrea la base `hallazgos_test` en el servidor de desarrollo con
las credenciales de `.env.development`. Detalles en `test/db/README.md`.

### Validaciones antes del push

Con Docker Desktop iniciado en modo Linux, `git push` ejecuta en contenedores
Node 24 y la versión de pnpm fijada en `packageManager`. Instala dependencias
con `--frozen-lockfile` y corre los mismos comandos compartidos con Actions:
TypeScript, unitarias con cobertura y sus umbrales, HTTP, pruebas de PostgreSQL,
compilación y pruebas del worker de correo con Redis y SMTP controlado.
Cualquier fallo bloquea el push, incluido Docker apagado.

El hook prueba una copia del commit de cada referencia enviada, no los cambios
sin commit. Los nuevos scripts y archivos de CI deben incluirse en el commit.
Para revisar el directorio de trabajo antes de crear ese commit:

```bash
pnpm ci:local
```

Para revisar un commit específico: `pnpm ci:local <SHA-completo>`.
La primera ejecución descarga imágenes y dependencias y tarda más.
PostgreSQL 18.6 y Redis 7.4 son desechables, sin puertos publicados, archivos
`.env` ni acceso a los datos locales. Al terminar se eliminan sus contenedores
y volúmenes. Husky se instala con `pnpm install`; `HUSKY=0` y `--no-verify`
permiten omitir hooks, por lo que los controles de Actions siguen siendo necesarios.

La versión de PostgreSQL de `compose.ci.yaml` y `.github/workflows/deploy.yml`
debe actualizarse junto con producción; ambas fijan `postgres:18.6`.

## Despliegue

El único camino a producción es **GitHub Actions**: cada push a `main` corre
typecheck, unitarias, HTTP y base de datos; si todo pasa, entra por SSH al VPS y
ejecuta `~/scripts/hallazgos-api.sh`. Ese script sincroniza `main`, instala,
compila, recarga PM2 y comprueba `/api/v1/health`.

En PM2 (`ecosystem.config.js`, namespace `comportarte`):

- `api-comp`: la API, 2 instancias en cluster.
- `mail-worker`: el envío de correos, 1 instancia.

```bash
pnpm mail:status   # estado de la cola de correos en producción
pnpm mail:admin <health|report|resume|retry|cancel> …   # ver src/mail-admin.ts
```

Estas pruebas reproducen las validaciones previas al deploy. El paso SSH y el
script del VPS solo corren en Actions: conexión, secretos, espacio en disco,
configuración y servicios de producción todavía pueden causar un fallo allí.

## Observabilidad

En producción, con `OBSERVE_*` configuradas, los logs van al stream
`api_comportarte` y las trazas (HTTP y consultas a PostgreSQL) a OpenObserve vía
OpenTelemetry (`src/instrumentation.ts`, cargado con `--import`). Las trazas
enlazan con las sesiones de RUM de la UI. En desarrollo no se envía nada.

## Versión de despliegue y recarga de la UI

`pnpm build` compila la API y, si termina correctamente, crea un UUID en
`dist/deployment-version.json`. En producción, el servicio de despliegues
lee ese ID una vez al arrancar y lo anuncia en el WebSocket con el evento
`api-version`, junto con la versión publicada de UI. Un reinicio de PM2
conserva el ID; un build nuevo obtiene otro incluso para el mismo commit.
El proceso anterior conserva su ID mientras se compila su reemplazo.

La ruta predeterminada usa el directorio de trabajo del proceso PM2.
`API_VERSION_FILE` permite sobrescribir la ruta para pruebas o una instalación
distinta. En desarrollo no se anuncia una versión de API salvo que se indique
esa ruta. El ID se genera en el VPS, sin nuevos secretos de GitHub Actions.

Desplegar primero esta API y después la UI que reconoce `api-version`.
Las UIs anteriores siguen recibiendo los avisos `ui-version` habituales.
