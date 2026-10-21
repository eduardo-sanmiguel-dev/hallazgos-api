# Pruebas con base de datos (E2E e integración)

Corren la app completa (`AppModule`) contra una base PostgreSQL **aislada**
en el mismo servidor local que la base de desarrollo.

```bash
pnpm test:db        # E2E de endpoints críticos + integración del dashboard
pnpm test:db:cov    # lo mismo, con cobertura de dashboard.service (umbral 90/70/90/90)
```

## Qué hace

- `global-setup.ts`: crea la base `hallazgos_test` si no existe (o la de
  `TEST_DB_NAME`, que **debe** terminar en `_test`).
- Cada archivo de pruebas (`createE2eApp` / `recreateTestSchema`) borra y
  vuelve a crear el esquema desde las entidades y marca las migraciones como
  ejecutadas. Corren uno a la vez (`maxWorkers: 1`).
- Credenciales: se leen de `.env.development` (no se copian a ningún
  archivo). `NODE_ENV=test`, `JWT_SECRET_KEY` y `APP_KEY` propios de pruebas.
- Correos: `MailService` se reemplaza por un simulado; no se envía nada.
- Imágenes: las pruebas de hallazgos suben PNG de 1×1 a
  `public/static/images/evidences` y los borran al terminar.
- `--forceExit`: el transporte SMTP de `MailerModule` deja una conexión
  abierta al cerrar la app.
- Cada archivo corre en su propio proceso (`workerIdleMemoryLimit`): al
  encadenar varias apps en el mismo proceso Jest se caía de forma
  intermitente (código nativo en Windows).
- `@nestjs/observe` se sustituye por `stubs/nestjs-observe.ts`: se publica
  solo como ESM (Jest no lo carga con `require`) y en pruebas no debe enviar
  telemetría.

## Archivos

| Archivo                          | Contenido                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `schema.db-spec.ts`              | La base es la de pruebas; esquema y datos base.                                 |
| `auth-users.db-spec.ts`          | Login, app key, sesión (401), usuarios (400/404).                               |
| `evidences.db-spec.ts`           | Crear, ver, estados (403/409), comentar, cancelar, GraphQL, descargas.          |
| `epps.db-spec.ts`                | Entregas de EPP, frecuencia, formato Excel, equipos, plantas ajenas (404).      |
| `ciaels.db-spec.ts`              | CIAEL y sus 13 catálogos.                                                       |
| `gemba-extinguishers.db-spec.ts` | Recorrido Gemba completo (observador) e inspecciones de extintores.             |
| `dashboard.int-spec.ts`          | SQL del dashboard: valores, todos los endpoints, filtros y fugas entre plantas. |

Requisito: PostgreSQL local corriendo (el mismo de desarrollo) y un usuario
con permiso para crear bases (`CREATEDB`).

## Regresiones de flujos críticos

`critical-flows.db-spec.ts` agrega pruebas de roles de usuarios, aislamiento por
planta, recuperación de contraseña concurrente, rollback de creación y borrado de
EPP, frecuencia en entregas simultáneas y carreras de estados de hallazgos. Se
ejecuta automáticamente con `pnpm test:db`; ver `docs/flujos-criticos.md`.

## GitHub Actions

El job `database-tests` de `.github/workflows/deploy.yml` usa PostgreSQL 14
como servicio temporal del runner, con la base `hallazgos_test` y credenciales
exclusivas de CI. El contenedor se elimina al terminar el job y el deploy por
SSH requiere que pasen tanto las pruebas unitarias como las de base de datos.

En CI las conexiones se configuran exclusivamente mediante `DB_HOST`, `DB_PORT`,
`DB_USERNAME`, `DB_PASSWORD` y `TEST_DB_NAME`; no se lee `.env.development`.
Las demás variables de la aplicación tienen valores de prueba definidos en el
workflow. No se usan secretos del VPS. Se rechazan `NODE_ENV=production`, nombres
de base que no sean identificadores terminados en `_test` y, en CI, hosts que no
sean de loopback. Los correos permanecen simulados.

Fuera de CI, `.env.development` es opcional si las variables necesarias ya están
configuradas en el entorno.
