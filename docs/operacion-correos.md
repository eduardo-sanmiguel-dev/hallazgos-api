# Operación de correos persistentes

Implementación local del 5 de noviembre de 2026. La API productiva continúa con su versión anterior hasta que Eduardo haga commit y push. No se recuperaron ni reenviaron los correos históricos del incidente.

## Publicación

Incluir en el commit el código, migración, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, configuración PM2, pruebas y workflow. No incluir `.env.*`, los archivos de `var/mail-outbox` ni credenciales del VPS.

El VPS ya tiene Redis persistente en `/home/eduardo/comportarte-messaging`, publicado solo en `127.0.0.1:6381`. La imagen está fijada por digest. Se comprobaron Docker y PM2 habilitados al arrancar, y la conservación de un dato de prueba tras reiniciar Redis. Los secretos nuevos están únicamente en `.env.production` y la configuración privada del servidor; la clave de desarrollo local también queda en el archivo ignorado `.env.development`.

El script de despliegue existente `~/scripts/hallazgos-api.sh` compila, ejecuta las migraciones cuando detecta el worker nuevo y recarga la API. Tras verificar `/health`, llama a `~/comportarte-messaging/after-deploy.sh`, que comprueba Redis, inicia `mail-worker`, exige un heartbeat posterior a ese arranque, ejecuta `pm2 save` y activa las reglas nuevas de OpenObserve. No hace falta copiar manualmente el código de la API al VPS.

Si falla la instalación o el build, el worker anterior continúa ejecutándose. Si falla el arranque del worker nuevo, el despliegue falla y las notificaciones ya guardadas quedan pendientes. Revisar el log del deploy y PM2. Si falla la activación de OpenObserve con el worker saludable, repetir:

```bash
python3 ~/comportarte-messaging/provision-observe.py --activate
```

Las tablas se crean con `1793900000000-create-mail-outbox.ts`. El worker no ejecuta migraciones. La API conserva su comprobación habitual de migraciones al arrancar: las que ya ejecutó el paso de despliegue no se repiten.

## Comportamiento

- Creación, inicio, cierre, reasignación y cancelación guardan hallazgo y notificaciones en una transacción. Un fallo de PostgreSQL, render o copia de un adjunto aborta esa operación; una caída de Redis o SMTP no la bloquea.
- La API renderiza HTML antes del commit. El worker no consulta el hallazgo actual para reconstruir un correo antiguo. Los adjuntos se copian por hash a un directorio privado; el contenido cifrado de PostgreSQL referencia esas copias.
- Un correo por destinatario normalizado y evento. Otra reasignación genera otro evento. Se conservan las reglas de plantas y responsables existentes.
- PostgreSQL es el registro duradero. Redis contiene identificadores de ejecución y puede reconstruirse. El reconciliador se ejecuta al arrancar y cada cinco segundos.
- Se mantiene una reserva por notificación y otra por cuenta SMTP. El control en PostgreSQL se comparte entre workers: una conexión por cuenta y al menos tres segundos entre inicios. BullMQ añade su propio límite, sin decidir los reintentos de negocio.
- Errores temporales: ocho intentos iniciales como máximo, con esperas de 1, 5, 15, 30, 60, 120 y 240 minutos y jitter. Caducidad de notificaciones de hallazgos: 24 horas. Los reintentos manuales añaden un presupuesto de ocho intentos sin reiniciar el historial acumulado.
- Cuota del remitente, autenticación o permisos: pausa duradera por cuenta. Corregir la causa y reanudar explícitamente.
- Al reiniciar el VPS se recuperan los pendientes. Una reserva `sending` vencida pasa a `uncertain`: pudo haberse aceptado por SMTP. No se reenvía automáticamente.
- `accepted` acredita aceptación SMTP, no llegada a bandeja. El Message-ID se conserva para investigación y no garantiza deduplicación del proveedor.

Las solicitudes de contraseña tienen prioridad sobre hallazgos y caducan si no llegan al worker en cuatro minutos. El worker comprueba el usuario y la huella de su contraseña, genera el enlace definitivo de cinco minutos al primer intento elegible y lo guarda cifrado antes de SMTP. Los reintentos reutilizan ese token; no renuevan su vigencia. Una solicitud nueva cancela las anteriores que todavía no se estaban enviando. Se mantiene la respuesta genérica del endpoint.

## Consulta y recuperación

Ejecutar desde `~/hallazgos-api`, como el dueño de la aplicación:

```bash
pnpm mail:status
pm2 logs mail-worker --lines 80 --nostream
docker compose -f ~/comportarte-messaging/docker-compose.yml ps
```

Después de corregir la cuota o las credenciales y verificar la cuenta:

```bash
pnpm mail:admin resume comportarte@hada.com.co
```

Esto libera únicamente notificaciones bloqueadas que siguen vigentes. Los correos caducados requieren revisión; no se rejuvenecen automáticamente. La reanudación genera un evento de recuperación en OpenObserve.

Para un fallo definitivo cuya causa ya se corrigió:

```bash
pnpm mail:admin retry <UUID>
```

Para un resultado incierto, consultar primero las trazas del proveedor usando el Message-ID/horario. Solo si se decide reenviar aceptando el riesgo de duplicado:

```bash
pnpm mail:admin retry <UUID> --acknowledge-duplicate-risk
```

Para descartar una notificación revisada, usar `pnpm mail:admin cancel <UUID>`; registra la decisión y libera su contenido. No permite cancelar un envío en curso.

La herramienta no permite reprogramar aceptados, mensajes sin contenido o caducados. Los reintentos manuales quedan en `email_attempts`. No hay un endpoint administrativo público para estas operaciones.

## Observabilidad

Dashboard nuevo: **ComportArte - Correos**, ID `7524213414034407424`. Muestra aceptaciones, eventos de revisión, último snapshot de pendientes/bloqueados y los incidentes. Las consultas fueron validadas contra OpenObserve. Hasta publicar el worker, sus paneles no tendrán eventos nuevos.

Reglas nuevas, preparadas desactivadas y activadas por el despliegue tras verificar el worker:

- `correo_outbox_atencion`: errores que requieren intervención, incluyendo bloqueo de cuenta, cola inaccesible, backlog y resultados inciertos.
- `correo_outbox_recuperado`: cuenta reanudada o worker listo tras arranque/recuperación. El reporte administrativo emite `mail_state_reported`, que no dispara esta alerta; `mail_worker_ready` se reserva al worker real.
- `correo_outbox_worker_detenido`: ausencia de heartbeat durante dos minutos.

Se usa el destino Telegram existente con una plantilla independiente para la cola. La regla `fallo_envio_correos` se conserva: mientras esté la API anterior sigue cubriéndola; con la nueva API permite detectar un error al registrar una solicitud de recuperación que no consiguió entrar al outbox. Los fallos transitorios de SMTP se registran como eventos de reintento y no disparan esa regla.

Los logs estructurados usan `context=MailWorker`, `component=mail-worker`, IDs, categoría y resultado. No contienen el HTML, tokens, contraseñas ni direcciones de los destinatarios. Los códigos SMTP de los intentos quedan en PostgreSQL. Las alertas tienen silencio de 30 minutos: consultar el dashboard para ver los cambios durante ese intervalo.

## Persistencia, mantenimiento y rollback

Respaldar juntos PostgreSQL, `var/mail-outbox/blobs` y `MAIL_OUTBOX_KEY`. Redis facilita ejecución y recuperación rápida, pero los backups de PostgreSQL y adjuntos permiten reconstruir pendientes si se pierde su volumen. Guardar esos backups fuera del VPS y probar restauración; esta implementación no crea un segundo servidor ni un servicio externo de backups.

El contenido se cifra con AES-256-GCM. No cambiar ni perder `MAIL_OUTBOX_KEY` mientras existan mensajes retenidos: el contenido no puede descifrarse sin ella. La configuración de Redis requiere contraseña, AOF y `noeviction`; su límite interno es 256 MiB y el contenedor admite hasta 512 MiB.

El reconciliador elimina contenido de aceptados/cancelados/caducados, intentos de más de 30 días y metadatos resueltos de más de 90 días. Conserva los casos `dead` y `uncertain` para revisión. Una tarea diaria elimina únicamente copias de adjuntos sin referencias y con más de un día; coordina sus borrados con las transacciones que crean notificaciones. Un fallo de limpieza alerta y no detiene la cola.

Para detener envíos conservando pendientes:

```bash
pm2 stop mail-worker
```

Un rollback del código debe pausar primero el worker y evitar que un mismo evento pase por envío directo y por outbox. No borrar Redis, las tablas ni las copias para hacer rollback. La migración rechaza revertirse mientras existan notificaciones sin resolver.

## Validación reproducible

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:cov -- --runInBand
node scripts/coverage-goal.js
pnpm test:e2e -- --runInBand
pnpm test:db -- --runInBand
pnpm build
```

Las pruebas de base de datos deben apuntar a un PostgreSQL desechable con `TEST_DB_NAME` terminado en `_test`; recrean ese esquema. Incluyen una prueba HTTP con el outbox real que verifica rollback del hallazgo cuando falla el registro del correo.

El smoke test del worker compilado requiere también un Redis **desechable**: elimina su cola de prueba. Crea un SMTP local controlado y no contacta Microsoft:

```bash
MAIL_TEST_DATABASE=comportarte_mail_runtime_test \
MAIL_TEST_PG_PORT=5432 MAIL_TEST_REDIS_PORT=6379 \
MAIL_TEST_PG_USER=hallazgos_ci MAIL_TEST_PG_PASSWORD=hallazgos_ci_only \
pnpm test:mail:runtime
```

El workflow de CI incluye este test con PostgreSQL y Redis temporales. Verifica rechazo SMTP temporal, posterior aceptación, reinicio de worker, reconstrucción tras pérdida de trabajos Redis y pausa de cuenta por cuota.

Validación realizada: 1,618 pruebas unitarias, 251 pruebas de base de datos, 29 pruebas HTTP y los escenarios del smoke test SMTP/Redis. También se verificaron por separado los dos casos HTTP con outbox real. Los servicios desechables utilizados se retiraron del VPS.
