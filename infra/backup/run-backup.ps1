# Lanzador de backup-prod.sh para la tarea programada.
#
# Antes la tarea llamaba directo a "conhost --headless wsl.exe ...": si WSL
# aun no estaba listo al iniciar sesion, wsl.exe fallaba antes de correr el
# script, conhost ocultaba el error y Windows reportaba "0" (exito) sin
# respaldo ni aviso. Este lanzador:
#   1. espera a que WSL responda (reintentos);
#   2. corre backup-prod.sh y devuelve su codigo real;
#   3. si falla sin que el script lo haya registrado, escribe ERROR en
#      ULTIMO_RESPALDO.txt y en la bitacora, y avisa con msg.exe.
#
# Si el ultimo respaldo fue OK hace menos de -SkipIfRecentHours (p. ej. se
# reinicio la PC y se disparo otra vez "al iniciar sesion"), no repite: solo
# lo anota en la bitacora. -Force respalda de todos modos.

param(
  [string]$Dest = "C:\Users\eduar\proyects\hallazgos\backups-db",
  [string]$Wsl = "wsl.exe",
  [string]$Script = (Join-Path $PSScriptRoot "backup-prod.sh"),
  [int]$Attempts = 10,
  [int]$RetrySeconds = 30,
  [double]$SkipIfRecentHours = 1,
  [switch]$Force,
  [switch]$NoNotify
)

function ConvertTo-WslPath([string]$path) {
  $full = [System.IO.Path]::GetFullPath($path)
  "/mnt/" + $full.Substring(0, 1).ToLower() + ($full.Substring(2) -replace '\\', '/')
}

function Write-Log([string]$line) {
  $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $logs = Join-Path $Dest "logs"
  New-Item -ItemType Directory -Force -Path $logs | Out-Null
  $logfile = Join-Path $logs ("backup-" + (Get-Date -Format "yyyy-MM") + ".log")
  Add-Content -Path $logfile -Value "$now $line"
}

# Fecha del ultimo respaldo OK segun ULTIMO_RESPALDO.txt ("OK yyyy-MM-dd HH:mm:ss"),
# o $null si no hay, fallo o no se entiende.
function Get-LastOk {
  $status = Join-Path $Dest "ULTIMO_RESPALDO.txt"
  if (-not (Test-Path $status)) { return $null }
  $first = Get-Content $status -TotalCount 1
  if ($first -notmatch '^OK (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})') { return $null }
  [datetime]::ParseExact($Matches[1], "yyyy-MM-dd HH:mm:ss",
    [System.Globalization.CultureInfo]::InvariantCulture)
}

function Write-Failure([string]$reason) {
  $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Log "ERROR (lanzador): $reason"
  Set-Content -Path (Join-Path $Dest "ULTIMO_RESPALDO.txt") -Value "ERROR $now - $reason"
  if (-not $NoNotify) {
    msg.exe '*' "Fallo el respaldo de produccion de Hallazgos: $reason" 2>$null
  }
}

$started = Get-Date

# 0. No repetir un respaldo reciente.
if (-not $Force) {
  $lastOk = Get-LastOk
  if ($lastOk -and $lastOk -le $started -and ($started - $lastOk).TotalHours -lt $SkipIfRecentHours) {
    $ago = [math]::Floor(($started - $lastOk).TotalMinutes)
    Write-Log "Omitido: ya hay un respaldo OK de hace $ago min ($($lastOk.ToString('yyyy-MM-dd HH:mm:ss')))"
    exit 0
  }
}

# 1. Esperar a WSL.
$ready = $false
for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
  & $Wsl -e true 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  if ($attempt -lt $Attempts) { Start-Sleep -Seconds $RetrySeconds }
}
if (-not $ready) {
  Write-Failure "WSL no respondio tras $Attempts intentos"
  exit 1
}

# 2. Respaldo.
& $Wsl -e bash (ConvertTo-WslPath $Script)
$code = $LASTEXITCODE

# 3. Si fallo y el script no alcanzo a registrarlo, registrarlo aqui.
if ($code -ne 0) {
  $status = Join-Path $Dest "ULTIMO_RESPALDO.txt"
  $recorded = (Test-Path $status) -and ((Get-Item $status).LastWriteTime -ge $started)
  if (-not $recorded) {
    Write-Failure "backup-prod.sh termino con codigo $code"
  }
}
exit $code
