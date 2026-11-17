#!/usr/bin/env bash
# Pruebas de la retención de backup-prod.sh (sin red ni VPS).
# Uso (en WSL): bash infra/backup/backup-prod.test.sh

set -Eeuo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=backup-prod.sh
source "$here/backup-prod.sh"
log() { :; }

failures=0
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

check() {
  local description=$1 expected=$2 actual=$3
  if [[ $expected == "$actual" ]]; then
    echo "ok   - $description"
  else
    echo "FAIL - $description"
    echo "       esperado: $expected"
    echo "       obtenido: $actual"
    failures=$((failures + 1))
  fi
}

listing() {
  (cd "$1" && ls -1 | sort | tr '\n' ' ' | sed 's/ $//')
}

# file_date
check "file_date lee la fecha del nombre" "2026-11-17" \
  "$(file_date /x/hallazgos_db_prod-2026-11-17_1400.dump)"
check "file_date ignora nombres sin fecha" "" "$(file_date /x/notas.txt)"

# prune_daily: con hoy = 2026-11-17 y 30 días, el corte es 2026-10-18.
daily="$tmp/daily"
mkdir -p "$daily"
touch "$daily/hallazgos_db_prod-2026-10-17_1400.dump" \
  "$daily/globals-2026-10-17_1400.sql" \
  "$daily/hallazgos_db_prod-2026-10-18_0900.dump" \
  "$daily/hallazgos_db_prod-2026-11-17_1400.dump" \
  "$daily/hallazgos_db_prod-2026-11-17_1400.dump.part" \
  "$daily/LEEME.txt"
prune_daily "$daily" 2026-11-17 30
check "prune_daily borra solo lo anterior al corte y respeta otros archivos" \
  "LEEME.txt hallazgos_db_prod-2026-10-18_0900.dump hallazgos_db_prod-2026-11-17_1400.dump hallazgos_db_prod-2026-11-17_1400.dump.part" \
  "$(listing "$daily")"

# keep_monthly: solo el primer respaldo de cada mes.
monthly="$tmp/monthly"
mkdir -p "$monthly"
keep_monthly "$daily/hallazgos_db_prod-2026-11-17_1400.dump" "$monthly" hallazgos_db_prod
touch "$daily/hallazgos_db_prod-2026-11-18_1400.dump"
keep_monthly "$daily/hallazgos_db_prod-2026-11-18_1400.dump" "$monthly" hallazgos_db_prod
check "keep_monthly guarda un solo respaldo por mes" \
  "hallazgos_db_prod-2026-11-17_1400.dump" "$(listing "$monthly")"

# prune_monthly: conserva los N más recientes de cada prefijo.
rm -f "$monthly"/*
for month in 01 02 03 04; do
  touch "$monthly/hallazgos_db_prod-2026-$month-01_1400.dump"
done
touch "$monthly/globals-2026-01-01_1400.sql"
prune_monthly "$monthly" hallazgos_db_prod 2
check "prune_monthly conserva los más recientes y no toca otros prefijos" \
  "globals-2026-01-01_1400.sql hallazgos_db_prod-2026-03-01_1400.dump hallazgos_db_prod-2026-04-01_1400.dump" \
  "$(listing "$monthly")"
prune_monthly "$monthly" globals 2
check "prune_monthly no borra si hay menos que el límite" \
  "globals-2026-01-01_1400.sql hallazgos_db_prod-2026-03-01_1400.dump hallazgos_db_prod-2026-04-01_1400.dump" \
  "$(listing "$monthly")"

if ((failures > 0)); then
  echo "$failures prueba(s) fallaron"
  exit 1
fi
echo "Todas las pruebas pasaron"
