# Respaldos de producción

`backup-prod.sh` copia de producción a esta PC, dos veces al día (al iniciar
sesión y a las 14:00):

- **Base de datos** `hallazgos_db_prod` (`pg_dump -Fc`), verificada en el VPS
  con `pg_restore --list` y comparada por sha256 al bajarla.
- **Roles y permisos** (`pg_dumpall --globals-only`), para restaurar en un
  servidor nuevo.
- **Fotos** de `public/static` con rsync (solo lo nuevo; nunca borra).
- **Hojas de datos de seguridad** (PDF) de `data/hds` con rsync (igual).

La PC jala los datos: el VPS no tiene acceso a la PC, así que quien entre al
servidor no puede borrar los respaldos.

## Dónde quedan

`C:\Users\eduar\proyects\hallazgos\backups-db\`

| Carpeta / archivo     | Contenido                                         |
| --------------------- | ------------------------------------------------- |
| `db\daily\`           | Cada respaldo de los últimos 30 días              |
| `db\monthly\`         | El primer respaldo de cada mes (últimos 12 meses) |
| `logs\`               | Bitácora por mes                                  |
| `ULTIMO_RESPALDO.txt` | `OK` o `ERROR` de la última corrida               |

Las **fotos** y las **HDS** no van ahí: se respaldan directo en
`hallazgos-api\public\static\` y `hallazgos-api\data\hds\` (las carpetas que
usa el API en desarrollo), para tener una sola copia en la PC. rsync nunca
borra: si en desarrollo se borra un archivo, el siguiente respaldo lo vuelve a
bajar del servidor.

Si una corrida falla aparece un aviso de Windows (`msg.exe`).

## Instalación

1. WSL con la llave autorizada en el VPS (`~/.ssh/config` de WSL apunta a
   `~/.ssh/hostinger_id`).
2. En el VPS, `~/.pgpass` (permisos 600):
   `127.0.0.1:5324:*:postgres:<contraseña>`.
3. Registrar la tarea (PowerShell, sin administrador):

   ```powershell
   powershell -ExecutionPolicy Bypass -File infra\backup\register-task.ps1
   ```

Correr a mano: `Start-ScheduledTask 'Hallazgos - respaldo produccion'` o, en
WSL, `bash infra/backup/backup-prod.sh`.

Pruebas de la retención (sin red): `bash infra/backup/backup-prod.test.sh`.

## Restaurar

Siempre primero en una base **nueva**, nunca encima de producción:

```bash
createdb -h 127.0.0.1 -p 5324 -U postgres hallazgos_restore
pg_restore -h 127.0.0.1 -p 5324 -U postgres -d hallazgos_restore --no-owner \
  hallazgos_db_prod-AAAA-MM-DD_HHMM.dump
```

En un servidor nuevo, antes del `pg_restore`, crear los roles con
`psql -U postgres -f globals-AAAA-MM-DD_HHMM.sql`. Las fotos se copian de
vuelta a `hallazgos-api/public/static/` con rsync.
