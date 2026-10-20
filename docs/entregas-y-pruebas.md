# Entregas y pruebas manuales (actualizado 2026-10-20)

## Antes de las pruebas manuales: pruebas automáticas

```bash
# hallazgos-api
pnpm test:cov:goal   # unitarias + meta global (80/70)
pnpm test:e2e        # contrato HTTP sin base
pnpm test:db:cov     # E2E y dashboard contra hallazgos_test (PostgreSQL local)
pnpm typecheck && pnpm lint && pnpm build

# hallazgos-ui
pnpm build
pnpm test:e2e        # Playwright (API de desarrollo en el puerto 4000)
```

## Checklist de pruebas manuales en desarrollo

Prepara antes: un hallazgo **Abierto**, uno **En progreso**, uno **Cerrado** y
uno **Cancelado** en una planta del usuario de prueba, y el id de un hallazgo
de **otra** planta. "Asignado" = supervisor o responsable del hallazgo.

### Todos los roles

- [ ] Iniciar y cerrar sesión.
- [ ] Restablecer contraseña: el enlace funciona **una sola vez**.
- [ ] Hallazgos: solo aparecen los de sus plantas; comentar funciona en los
      cuatro estados.
- [ ] En un hallazgo Cerrado o Cancelado el menú solo muestra "Ver detalles".
- [ ] Descargar hallazgos en Excel y en PDF (también con filtros que no
      devuelvan resultados: el PDF sale vacío, ya no da error).
- [ ] Dashboard: el filtro de planta solo ofrece sus plantas; todas las
      gráficas cargan; el **histórico por mes** solo muestra sus plantas.
- [ ] (DevTools) `GET /api/v1/evidences/<id de otra planta>` → 404.
- [ ] (DevTools) `GET /api/v1/dashboard/global-summary?manufacturingPlantId=<ajena>` → 404.

### General

- [ ] Crear un hallazgo en su planta: se guarda y llegan los correos.
- [ ] No asignado: el menú no ofrece En progreso, Cerrar, Reasignar ni Cancelar.
- [ ] Asignado como responsable: ofrece **solo Reasignar**.
- [ ] Reasignar a un usuario de otra planta muestra error.
- [ ] EPP: registrar una entrega; sin elegir equipos muestra error; validar
      frecuencia de un equipo recién entregado indica los días que faltan.
- [ ] Inspección de extintores **después de las 18:00 (México)** con fechas de
      hoy: se guarda (antes las rechazaba como pasadas).

### Supervisor

- [ ] Asignado, Abierto: "En progreso" pide imagen y lo deja En progreso.
- [ ] Asignado: "Cerrar hallazgo" en Abierto **y en En progreso**; al cerrar
      con foto llega el correo de solución **con la foto** (en producción
      fallaba: revisar los logs por `No se pudo enviar el correo "solution"`).
- [ ] Asignado: Reasignar en Abierto y En progreso; no ve "Cancelar".
- [ ] Supervisor **no asignado**: no ve En progreso, Cerrar ni Reasignar.
- [ ] Gemba (como observador): iniciar un recorrido del día y registrarlo
      evaluando todos los conceptos.

### Administrador (sin correo especial)

- [ ] Ve "En progreso", "Reasignar" y "Cancelar" en Abierto y En progreso;
      **no** ve "Cerrar hallazgo".
- [ ] Usuarios: crear sin planta o sin contraseña muestra error; **editar sin
      cambiar la contraseña** guarda y la contraseña sigue funcionando.
- [ ] Empleados: editar solo el nombre conserva área, puesto, género y
      plantas.
- [ ] Zonas: editar solo el nombre conserva planta y área; quitar el área
      sigue funcionando.
- [ ] Procesos y tipos secundarios: editar el nombre conserva planta / tipo
      principal.
- [ ] Plantas: una latitud mayor a 90 muestra error.
- [ ] Áreas, zonas Gemba y conceptos Gemba: un nombre de solo espacios
      muestra error.
- [ ] Equipos: sin filtro muestra los de todas sus plantas; crear y editar.
- [ ] EPP y CIAEL: lista, filtros y descarga del formato Excel.
- [ ] ICS: registrar con más personas incorrectas que el total muestra error.

### Correo especial

- [ ] Solo lista especial (p. ej. `klarios@…`): En progreso, Cerrar y
      Reasignar sin estar asignado; no ve Cancelar.
- [ ] Especial + cancelación (p. ej. `sst@hadamexico.com`): además Cancelar.
- [ ] Solo cancelación (p. ej. `dtrujillo@…`): Cancelar, pero no Cerrar ni En
      progreso.

### Estados y concurrencia (409)

- [ ] Dos pestañas: cancela en una y cierra en la otra sin recargar → mensaje
      "No se puede cerrar el hallazgo #… porque está en estado "Cancelado"".
- [ ] Dos cierres del mismo hallazgo: el segundo recibe 409 y no hay correos
      duplicados.

## Plan de entregas

Se desplegará todo junto al final, pero conviene revisar y hacer commit en
este orden (cada grupo pasa sus propias pruebas). Ya están en `main` (2026-10-19):
API `b07048f`, UI `532757f`.

| # | Grupo | API | UI | Depende de | Despliegue API + UI |
| --- | --- | --- | --- | --- | --- |
| 0 | Restablecer contraseña con token (en `main`) + ajustes de auth | `src/auth/*` | `FormRestorePassword`, `auth.service` | — | **Juntos**: cada versión rechaza a la otra. Los enlaces ya enviados dejan de servir. |
| 1 | Infraestructura de pruebas | `jest.config.js`, `test/utils/*`, `test/db/*`, `test/jest-db.json`, `scripts/coverage-goal.js`, `package.json` (scripts), reglas de ESLint, `app.module.ts` (GraphQL en memoria con `NODE_ENV=test`) | — | — | Solo API; sin efecto en producción. |
| 2 | Robustez y correos | `main.ts`, `mail.service.ts` (ruta de imágenes), `cluster.service` excluido | — | — | Solo API. |
| 3 | Usuarios | `src/users/*` | — | — | Solo API (el UI ya manda plantas y `password: ""`). |
| 4 | Plantas del usuario | `shared/utils/plant-scope.ts`, `shared/pipes/*`, `dashboard.controller.ts` + `dashboard.service.ts` (histórico), `epps/*`, `equipments/*`, `employees/*` | — | — | Solo API. |
| 5 | Dashboard sin `userId` | 7 endpoints eliminados | 20 componentes, 16 funciones de servicio y 16 interfaces eliminados | — | Cualquier orden: ninguna pantalla los usaba. |
| 6 | Hallazgos | `evidences/*` | `TableEvidences.tsx` | 4 | **API primero** y UI en la misma ventana. |
| 7 | Correcciones de módulos | `ciaels/*`, `gemba-walk-*`, `extinguisher-inspections/*`, `areas`, `zones`, `processes`, `secondary-types`, `manufacturing-plants` (DTO), `ics` | — | 1 (pruebas) | Solo API. |
| — | Documentación | `docs/*`, `test/db/README.md` | — | — | Con cualquiera. |

Notas:

- `jest.config.js` tiene umbrales de todas las carpetas: va con el último
  grupo que se suba, o el pre-push fallará en los anteriores.
- `test/app.e2e-spec.ts` mezcla pruebas de los grupos 0, 4 y 5; si se separan
  los commits, dividirlo con `git add -p`.
- `src/shared/services/gist-secret-guard.service.ts` y
  `src/shared/utils/query-string-array-transformer.util.ts` solo difieren en
  fin de línea (cambio previo): no incluirlos.
- Antes de desplegar: correr el checklist de arriba y confirmar en los logs de
  producción si el correo de solución con foto estaba fallando.
