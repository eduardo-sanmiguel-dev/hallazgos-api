#!/usr/bin/env bash
# Respaldo de producción (base de datos + fotos de evidencias) del VPS a esta
# PC. Corre en WSL desde el Programador de tareas de Windows (ver
# register-task.ps1): al iniciar sesión y a las 14:00.
#
# La PC jala los datos (el VPS no tiene acceso a la PC): si alguien entra al
# servidor no puede borrar estos respaldos.
#
# Requisitos:
#   - WSL con llave SSH autorizada en el VPS (~/.ssh/config de WSL).
#   - ~/.pgpass en el VPS (permisos 600) para que pg_dump no pida contraseña.
#
# Variables opcionales: BACKUP_VPS, BACKUP_DEST, BACKUP_DBS,
# BACKUP_PHOTOS_SRC, BACKUP_PHOTOS_DEST, BACKUP_KEEP_DAILY_DAYS,
# BACKUP_KEEP_MONTHLY.

set -Eeuo pipefail

VPS="${BACKUP_VPS:-eduardo@82.197.95.145}"
DEST="${BACKUP_DEST:-/mnt/c/Users/eduar/proyects/hallazgos/backups-db}"
DBS="${BACKUP_DBS:-hallazgos_db_prod}"
PHOTOS_SRC="${BACKUP_PHOTOS_SRC:-hallazgos-api/public/static/}"
# Las fotos van a la misma carpeta que usa el API en desarrollo (una sola
# copia en la PC). rsync nunca borra: si en desarrollo se borra una foto, el
# siguiente respaldo la vuelve a bajar.
PHOTOS_DEST="${BACKUP_PHOTOS_DEST:-/mnt/c/Users/eduar/proyects/hallazgos/hallazgos-api/public/static}"
KEEP_DAILY_DAYS="${BACKUP_KEEP_DAILY_DAYS:-30}"
KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-12}"
PG_CONN="-h 127.0.0.1 -p 5324 -U postgres -w"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=30)

log() {
  printf '%s %s\n' "$(date '+%F %T')" "$*"
}

# Fecha (YYYY-MM-DD) dentro del nombre de un respaldo:
# <base>-YYYY-MM-DD_HHMM.<ext>. Vacío si el nombre no la trae.
file_date() {
  local name
  name=$(basename "$1")
  if [[ $name =~ -([0-9]{4}-[0-9]{2}-[0-9]{2})_[0-9]{4}\. ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

# Borra de DIR los respaldos diarios con fecha anterior a TODAY - DAYS.
# Usa la fecha del nombre (no la del archivo) para no depender de NTFS.
prune_daily() {
  local dir=$1 today=$2 days=$3 cutoff file date
  cutoff=$(date -d "$today -$days days" +%F)
  shopt -s nullglob
  for file in "$dir"/*; do
    date=$(file_date "$file")
    if [[ -n $date && $date < $cutoff ]]; then
      rm -f -- "$file"
      log "Borrado por antigüedad: $(basename "$file")"
    fi
  done
  shopt -u nullglob
}

# Deja en DIR solo los KEEP respaldos mensuales más recientes de PREFIX.
prune_monthly() {
  local dir=$1 prefix=$2 keep=$3 file
  shopt -s nullglob
  local files=("$dir/$prefix"-*)
  shopt -u nullglob
  ((${#files[@]} > keep)) || return 0
  while IFS= read -r file; do
    rm -f -- "$file"
    log "Borrado mensual antiguo: $(basename "$file")"
  done < <(printf '%s\n' "${files[@]}" | sort | head -n "-$keep")
}

# Copia FILE a DIR como respaldo mensual si aún no hay uno de ese mes.
keep_monthly() {
  local file=$1 dir=$2 prefix=$3 month
  month=$(file_date "$file")
  month=${month:0:7}
  shopt -s nullglob
  local existing=("$dir/$prefix-$month"-*)
  shopt -u nullglob
  if ((${#existing[@]} == 0)); then
    cp -- "$file" "$dir/"
    log "Mensual de $month: $(basename "$file")"
  fi
}

remote() {
  ssh "${SSH_OPTS[@]}" "$VPS" "$@"
}

# Al iniciar sesión la red puede tardar: reintenta hasta ~5 minutos.
wait_for_vps() {
  local attempt
  for attempt in $(seq 1 10); do
    if remote true 2>/dev/null; then
      return 0
    fi
    log "VPS no disponible (intento $attempt/10); reintento en 30 s"
    sleep 30
  done
  log "No se pudo conectar al VPS"
  return 1
}

# pg_dump en el VPS, verificado allá (pg_restore --list) y comparado con
# sha256 al bajarlo. El archivo solo queda con su nombre final si todo cuadra.
backup_db() {
  local db=$1 stamp=$2 daily=$3 monthly=$4
  local name="$db-$stamp.dump"
  local tmp="/tmp/backup-$name"
  local local_file="$daily/$name"
  local remote_sum local_sum

  log "Base $db: pg_dump"
  remote_sum=$(remote "set -e; umask 077; trap 'rm -f $tmp' ERR;
    pg_dump $PG_CONN -Fc -d $db -f $tmp;
    pg_restore --list $tmp > /dev/null;
    sha256sum $tmp | cut -d' ' -f1")

  if ! rsync -a -e "ssh ${SSH_OPTS[*]}" "$VPS:$tmp" "$local_file.part"; then
    remote "rm -f $tmp" || true
    return 1
  fi
  remote "rm -f $tmp"

  local_sum=$(sha256sum "$local_file.part" | cut -d' ' -f1)
  if [[ $local_sum != "$remote_sum" ]]; then
    rm -f -- "$local_file.part"
    log "Base $db: el archivo descargado no coincide (sha256)"
    return 1
  fi
  mv -- "$local_file.part" "$local_file"
  log "Base $db: OK $(du -h "$local_file" | cut -f1) ($name)"
  keep_monthly "$local_file" "$monthly" "$db"
}

# Roles y permisos (no van en pg_dump): necesarios para restaurar en un
# servidor nuevo.
backup_globals() {
  local stamp=$1 daily=$2 monthly=$3
  local name="globals-$stamp.sql"
  remote "pg_dumpall $PG_CONN --globals-only" > "$daily/$name.part"
  mv -- "$daily/$name.part" "$daily/$name"
  log "Roles: OK ($name)"
  keep_monthly "$daily/$name" "$monthly" "globals"
}

# Fotos: solo baja lo nuevo o cambiado. Sin --delete: si una foto se borra en
# el servidor, aquí se conserva.
backup_photos() {
  local dest=$1
  log "Fotos: rsync"
  # -rlt (sin permisos ni dueño): NTFS no los guarda y rsync los
  # reintentaría en cada foto.
  rsync -rlt --partial --info=stats1 -e "ssh ${SSH_OPTS[*]}" \
    "$VPS:$PHOTOS_SRC" "$dest/" | sed 's/^/  /'
  log "Fotos: OK ($(du -sh "$dest" | cut -f1) en total)"
}

notify_failure() {
  local message="Falló el respaldo de producción de Hallazgos. Revisa $1"
  msg.exe '*' "$message" 2>/dev/null || true
}

main() {
  local daily="$DEST/db/daily" monthly="$DEST/db/monthly"
  local photos="$PHOTOS_DEST" logs="$DEST/logs"
  mkdir -p "$daily" "$monthly" "$photos" "$logs"

  local logfile="$logs/backup-$(date +%Y-%m).log"
  exec > >(tee -a "$logfile") 2>&1

  # Al iniciar sesión cerca de las 14:00 corren dos a la vez: solo una sigue.
  exec 9> "$DEST/.lock"
  if ! flock -n 9; then
    log "Ya hay un respaldo en curso; se omite este."
    return 0
  fi

  trap 'log "ERROR (línea $LINENO)"; echo "ERROR $(date "+%F %T") - ver $logfile" > "$DEST/ULTIMO_RESPALDO.txt"; notify_failure "$logfile"' ERR

  log "=== Inicio de respaldo ==="
  wait_for_vps

  local stamp db
  stamp=$(date +%F_%H%M)
  for db in $DBS; do
    backup_db "$db" "$stamp" "$daily" "$monthly"
  done
  backup_globals "$stamp" "$daily" "$monthly"
  backup_photos "$photos"

  prune_daily "$daily" "$(date +%F)" "$KEEP_DAILY_DAYS"
  for db in $DBS globals; do
    prune_monthly "$monthly" "$db" "$KEEP_MONTHLY"
  done

  printf 'OK %s\nBases: %s\nCarpeta: %s\n' "$(date '+%F %T')" "$DBS" "$DEST" \
    > "$DEST/ULTIMO_RESPALDO.txt"
  log "=== Respaldo terminado ==="
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
