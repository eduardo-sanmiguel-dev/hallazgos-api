# Pruebas de run-backup.ps1 con un wsl falso (sin WSL, red ni VPS).
# Uso: powershell -ExecutionPolicy Bypass -File infra\backup\run-backup.test.ps1

$ErrorActionPreference = "Stop"
$launcher = Join-Path $PSScriptRoot "run-backup.ps1"
$failures = 0

function Test-Case([string]$description, $expected, $actual) {
  if ($expected -eq $actual) {
    Write-Host "ok   - $description"
  } else {
    Write-Host "FAIL - $description"
    Write-Host "       esperado: $expected"
    Write-Host "       obtenido: $actual"
    $script:failures++
  }
}

# wsl falso: "-e true" responde cuando el contador llega a FAKE_READY_AT;
# "-e bash ..." sale con FAKE_BASH_CODE y, si FAKE_WRITE_STATUS, escribe el
# estado como lo haria backup-prod.sh.
$fake = @'
@echo off
if "%2"=="true" goto ready
if defined FAKE_WRITE_STATUS >"%FAKE_DEST%\ULTIMO_RESPALDO.txt" echo ERROR desde el script
exit /b %FAKE_BASH_CODE%
:ready
set n=0
if exist "%FAKE_DEST%\count" set /p n=<"%FAKE_DEST%\count"
set /a n+=1
>"%FAKE_DEST%\count" echo %n%
if %n% LSS %FAKE_READY_AT% exit /b 1
exit /b 0
'@

function Invoke-Launcher([int]$readyAt, [int]$bashCode, [bool]$writeStatus) {
  $dest = Join-Path ([System.IO.Path]::GetTempPath()) ("run-backup-test-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $dest | Out-Null
  $wsl = Join-Path $dest "wsl.cmd"
  Set-Content -Path $wsl -Value $fake -Encoding Ascii
  $env:FAKE_DEST = $dest
  $env:FAKE_READY_AT = $readyAt
  $env:FAKE_BASH_CODE = $bashCode
  $env:FAKE_WRITE_STATUS = if ($writeStatus) { "1" } else { $null }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher `
    -Dest $dest -Wsl $wsl -Script "C:\x\backup-prod.sh" -Attempts 3 -RetrySeconds 0 -NoNotify | Out-Null
  $code = $LASTEXITCODE
  $statusFile = Join-Path $dest "ULTIMO_RESPALDO.txt"
  $status = if (Test-Path $statusFile) { (Get-Content $statusFile -Raw).Trim() } else { "" }
  $log = (Get-ChildItem (Join-Path $dest "logs") -ErrorAction SilentlyContinue | Get-Content -Raw)
  $tries = (Get-Content (Join-Path $dest "count")).Trim()
  Remove-Item -Recurse -Force $dest
  [pscustomobject]@{ Code = $code; Status = $status; Log = "$log"; Tries = $tries }
}

$r = Invoke-Launcher -readyAt 99 -bashCode 0 -writeStatus $false
Test-Case "WSL nunca responde: sale con 1" 1 $r.Code
Test-Case "WSL nunca responde: reintenta 3 veces" "3" $r.Tries
Test-Case "WSL nunca responde: ULTIMO_RESPALDO dice ERROR" $true ($r.Status -like "ERROR * - WSL no respondio tras 3 intentos")
Test-Case "WSL nunca responde: queda en la bitacora" $true ($r.Log -like "*ERROR (lanzador): WSL no respondio*")

$r = Invoke-Launcher -readyAt 3 -bashCode 0 -writeStatus $false
Test-Case "WSL responde al 3er intento: el respaldo corre y sale con 0" 0 $r.Code
Test-Case "WSL responde al 3er intento: no escribe ERROR" "" $r.Status

$r = Invoke-Launcher -readyAt 1 -bashCode 7 -writeStatus $false
Test-Case "El script falla sin registrarlo: devuelve su codigo" 7 $r.Code
Test-Case "El script falla sin registrarlo: el lanzador escribe ERROR" $true ($r.Status -like "ERROR * - backup-prod.sh termino con codigo 7")

$r = Invoke-Launcher -readyAt 1 -bashCode 5 -writeStatus $true
Test-Case "El script falla y lo registro: devuelve su codigo" 5 $r.Code
Test-Case "El script falla y lo registro: no se sobrescribe su estado" "ERROR desde el script" $r.Status

if ($failures -gt 0) {
  Write-Host "$failures prueba(s) fallaron"
  exit 1
}
Write-Host "Todas las pruebas pasaron"
