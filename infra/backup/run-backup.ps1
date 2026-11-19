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

param(
  [string]$Dest = "C:\Users\eduar\proyects\hallazgos\backups-db",
  [string]$Wsl = "wsl.exe",
  [string]$Script = (Join-Path $PSScriptRoot "backup-prod.sh"),
  [int]$Attempts = 10,
  [int]$RetrySeconds = 30,
  [switch]$NoNotify
)

function ConvertTo-WslPath([string]$path) {
  $full = [System.IO.Path]::GetFullPath($path)
  "/mnt/" + $full.Substring(0, 1).ToLower() + ($full.Substring(2) -replace '\\', '/')
}

function Write-Failure([string]$reason) {
  $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $logs = Join-Path $Dest "logs"
  New-Item -ItemType Directory -Force -Path $logs | Out-Null
  $logfile = Join-Path $logs ("backup-" + (Get-Date -Format "yyyy-MM") + ".log")
  Add-Content -Path $logfile -Value "$now ERROR (lanzador): $reason"
  Set-Content -Path (Join-Path $Dest "ULTIMO_RESPALDO.txt") -Value "ERROR $now - $reason"
  if (-not $NoNotify) {
    msg.exe '*' "Fallo el respaldo de produccion de Hallazgos: $reason" 2>$null
  }
}

$started = Get-Date

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
