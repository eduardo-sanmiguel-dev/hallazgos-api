# Pendientes de seguridad

## Imágenes de hallazgos públicas

**Estado:** pendiente (detectado el 2026-10-20, no corregido a propósito).

### Problema

Las imágenes de los hallazgos (evidencia, en proceso y solución) se guardan en
`public/static/images/evidences/` y `ServeStaticModule` las sirve sin sesión
en `https://api.comportarte.com/static/images/evidences/<archivo>`.

- Cualquiera con la URL puede ver la imagen, sin iniciar sesión y sin importar
  la planta. Las reglas de acceso por planta de los endpoints de hallazgos no
  aplican aquí.
- Lo único que las protege es que el nombre es difícil de adivinar
  (`<uuid>-evidence.png` desde 2026-10; los archivos anteriores usaban el
  nombre que mandaba el cliente y algunos son predecibles, p. ej.
  `1774911447209-evidence.jpg`).
- Una URL compartida (correo reenviado, captura, historial del navegador)
  sigue funcionando para siempre.

### Propuesta

**Opción A — Servir las imágenes con sesión (recomendada).**

1. Mover las imágenes fuera de `public/` (p. ej. `storage/evidences/`) para que
   `ServeStaticModule` ya no las sirva.
2. Nuevo endpoint `GET /api/v1/evidences/:id/images/:kind`
   (`kind` = `evidence` | `process` | `solution`) que:
   - pasa por el middleware JWT (cookie de sesión);
   - usa `EvidencesService.findOne` (ya filtra por las plantas del usuario:
     404 si el hallazgo no es visible);
   - responde el archivo con `res.sendFile` y `Cache-Control: private`.
3. El nombre del archivo deja de salir del API: se pide por id de hallazgo.

**Opción B — URLs firmadas con vencimiento.**

El API devuelve, junto con cada hallazgo, una URL con firma HMAC y vencimiento
corto (p. ej. 15 minutos): `/static/evidences/<archivo>?exp=...&sig=...`. Un
middleware valida firma y vencimiento antes de servir el archivo.

- Ventaja: funciona en `<img>` sin cookies (útil si el UI y el API quedan en
  dominios distintos sin cookie compartida).
- Desventaja: una URL filtrada sirve hasta que vence; hay que generar y
  refrescar URLs en cada respuesta (incluida la de GraphQL).

### Impacto en el UI

- **`app/_shared/utils/index.ts` → `baseUrlImage`**: hoy arma
  `${NEXT_PUBLIC_URL_API_RAW}/static/images/evidences/<archivo>`. Con la
  opción A pasaría a `${NEXT_PUBLIC_URL_API}/evidences/<id>/images/<kind>`; con
  la B usaría la URL firmada que mande el API.
- **`app/(routes)/hallazgos/_components/TabsImageAndLogs.tsx`**: único
  componente que muestra las imágenes (vía `baseUrlImage`). Necesita el id del
  hallazgo y el tipo de imagen en lugar del nombre del archivo.
- **Opción A y cookies:** el `<img>` envía la cookie de sesión solo si el UI y
  el API comparten dominio de cookie. Hoy la cookie es del dominio
  `comportarte.com` con `SameSite=None; Secure`, así que funciona entre
  `comportarte.com` y `api.comportarte.com`. En desarrollo (`localhost`)
  también.

### Impacto en el API

- **Correos:** en producción `mail.service.ts` adjunta las imágenes
  descargándolas por URL pública
  (`https://api.comportarte.com/static/images/evidences/`). Hay que cambiarlo a
  la ruta local del archivo (como ya hace en desarrollo), o los correos
  quedarían sin imagen.
- **PDF de hallazgos:** `uploadStaticImage` lee el archivo del disco; solo hay
  que actualizar la carpeta.
- **Deploy:** mover los archivos existentes de `public/static/images/evidences/`
  a la nueva carpeta en el servidor (una sola vez) y ajustar `EVIDENCE_IMAGES_DIR`.

### Esfuerzo estimado

Opción A: endpoint + pruebas en el API, cambio en `baseUrlImage` y
`TabsImageAndLogs`, ajuste de correos y movimiento de archivos en el deploy.

## Inventario: endpoints que no validan planta, usuario ni rol

**Estado:** pendiente (inventario del 2026-10-20). No corregido; cada fila
necesita decisión.

Ya corregidos (no aparecen abajo): hallazgos (REST y GraphQL), dashboard,
EPP (`GET /epps`, `GET /epps/:id`, crear —empleado y equipos—, descarga,
`validate-delivery-frequency`, `DELETE /epps/history/:id`), equipos (lista,
crear, `GET`/`PATCH`/`DELETE /:id`) y la lista de empleados (`GET /employees`
con `manufacturingPlantId` de otra planta ya no devuelve nada).
También corregido en las pruebas de integración: `GET /dashboard/historical-by-month`
devolvía los conteos mensuales de **todas** las plantas; ahora solo las del
usuario. Verificado con datos de dos plantas que `status`, `zones`,
`main-types`, `evidences-by-month`, `top-users-by-plant` y `open-vs-closed`
ya respetan las plantas del usuario.

### Hallazgo transversal: no hay control de roles en el API

Ningún controlador valida el rol. El UI oculta menús según el rol, pero el API
acepta la petición de **cualquier usuario con sesión** (incluido un General).

| Riesgo | Endpoints | Qué permite | Arreglo propuesto |
| --- | --- | --- | --- |
| **Crítico** | `POST /users`, `PATCH /users/:id`, `DELETE /users/:id` | Un usuario General puede cambiar su propio rol a Administrador, cambiar la contraseña de cualquier usuario (tomar su cuenta), crear usuarios o desactivarlos, de cualquier planta. | Guard de roles (`@Roles(ROLE_ADMINISTRADOR)`) en las rutas de escritura de usuarios; además, limitar `:id` a usuarios que compartan planta (404). |
| **Alto** | `POST/PATCH/DELETE /manufacturing-plants/*` | Crear, renombrar o desactivar plantas (desactivar una planta deja sin acceso a sus usuarios). | Guard de rol Administrador. |
| Medio | Escritura de catálogos de configuración: `main-types`, `secondary-types`, `zones`, `Processes`, `areas`, `machines`, `rules-of-life`, `risk-factors`, `working-days`, `countries` y catálogos CIAEL (`accident-positions`, `associated-tasks`, `at-agents`, `at-mechanisms`, `body-parts`, `cie-diagnoses`, `genres`, `nature-of-events`, `type-of-injuries`, `type-of-links`, `types-of-events`) | Cualquier usuario puede crear, editar o desactivar catálogos que usan todas las plantas. | Guard de rol Administrador en `POST/PATCH/DELETE`. Requiere decidir qué roles administran cada catálogo. |

### Recursos de planta sin validar contra las plantas del usuario

En todos los casos el arreglo propuesto es el ya aprobado: `UserPlantPipe` /
`OptionalUserPlantPipe` para `manufacturingPlantId` y filtrar por
`requestContext.manufacturingPlantIds` al buscar por id (ajeno → 404).

| Riesgo | Módulo | Endpoints | Qué expone hoy |
| --- | --- | --- | --- |
| **Alto** | `users` | `GET /users/:id`; `GET /users` con `manufacturingPlantId` | Datos de usuarios de otras plantas (nombre, correo, rol, plantas). |
| **Alto** | `employees` | `GET/PATCH/DELETE /employees/:id` | Datos personales de empleados (nombre, código/cédula, puesto, área) de otras plantas; editarlos o desactivarlos. (Crear/editar ya descarta plantas ajenas y la lista ya se limita a las del usuario.) |
| **Alto** | `ciaels` | `GET /ciaels/download/excel` (exporta **todos** los registros de todas las plantas); `GET/PATCH/DELETE /ciaels/:id`; `GET /ciaels` (sin planta devuelve todas); `POST` con `manufacturingPlantId` o empleado ajenos | Registros de accidentes e incidentes (lesiones, diagnósticos CIE, datos del empleado) de otras plantas. |
| Medio | `extinguisher-inspections` | `GET/PATCH/DELETE /:id`, `GET /download/file/:id`; `GET /` (sin planta devuelve todas); `POST`/`PATCH` con planta ajena | Inspecciones de extintores de otras plantas y su descarga. |
| Medio | `gemba-walk-*` (`calendar`, `evaluations`, `observers`, `zones`) | `GET/PATCH/DELETE /:id`; listas sin planta devuelven todas; `POST` con planta ajena; `observers` acepta `userIds` de cualquier planta | Programación y resultados de recorridos Gemba de otras plantas. `gemba-walk/walks` sí valida la planta y al observador (`GET /walks/:id` de otra planta responde 403 en lugar de 404). |
| Medio | `emergency-teams` | `GET/PATCH/DELETE /:id`; `GET /` sin planta devuelve todas; `POST`/`PATCH` con planta ajena | Brigadas (personas) de otras plantas. |
| Medio | `ics` | `GET/PATCH/DELETE /:id`; `GET /` sin planta; `POST` con planta ajena | Registros ICS de otras plantas. |
| Bajo | `areas`, `zones`, `Processes`, `machines`, `accident-positions`, `associated-tasks`, `secondary-types` (`/by/manufacturing-plant/:id`) | `GET/PATCH/DELETE /:id`; listas con `manufacturingPlantId` ajeno; `POST` con planta ajena | Catálogos por planta (nombres de áreas, zonas, máquinas). Poco sensibles, pero se pueden modificar desde otra planta. |
| Bajo | `safety-data-files` (HDS) | `GET/PATCH/DELETE /:id` | Fichas de seguridad: son globales (sin planta); solo aplica el control de roles. |

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

## Carga de datos expuesta: `POST /rules-of-life/seed`

**Riesgo:** medio (integridad de datos). **Estado:** pendiente
(`it.failing` en `rules-of-life.service.spec.ts`).

Cualquier usuario con sesión puede llamarlo y cada llamada vuelve a insertar
las 18 áreas de comportamiento y las 8 reglas de vida (duplicados en los
catálogos de ICS). Propuesta: quitar el endpoint (la carga inicial ya se hizo)
o hacerlo idempotente y solo para administradores.

## Imágenes huérfanas en peticiones rechazadas

**Riesgo:** bajo (espacio en disco). **Estado:** pendiente.

Multer guarda la imagen en `public/static/images/evidences` **antes** de que
el servicio valide permisos o estado. Si la petición termina en 403/404/409
(p. ej. iniciar "en progreso" sin permiso), el archivo queda en disco sin
hallazgo que lo use. Propuesta: borrar `file.path` cuando el servicio lanza
un error (interceptor o `try/finally` en el controlador).
