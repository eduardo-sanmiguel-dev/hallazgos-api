# Registra (o actualiza) la tarea de Windows que corre backup-prod.sh en WSL:
# al iniciar sesión (con 2 minutos de espera para la red) y diario a las 14:00.
# Si la PC estaba apagada a las 14:00, corre en cuanto se pueda.
#
# Uso (PowerShell, sin administrador):
#   powershell -ExecutionPolicy Bypass -File infra\backup\register-task.ps1

$ErrorActionPreference = 'Stop'

$taskName = 'Hallazgos - respaldo produccion'
$launcher = (Join-Path $PSScriptRoot 'run-backup.ps1')
$user = "$env:USERDOMAIN\$env:USERNAME"

# conhost --headless: corre sin abrir una ventana de consola. run-backup.ps1
# espera a que WSL esté listo y avisa si el respaldo falla (wsl.exe directo
# fallaba en silencio al iniciar sesión y la tarea quedaba como exitosa).
$action = New-ScheduledTaskAction -Execute 'conhost.exe' `
  -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$launcher`""

$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $user
$atLogon.Delay = 'PT2M'
$daily = New-ScheduledTaskTrigger -Daily -At '14:00'

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3)

$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action `
  -Trigger @($atLogon, $daily) -Settings $settings -Principal $principal `
  -Description 'Respaldo de la base y fotos de producción de Hallazgos (infra/backup/backup-prod.sh).' `
  -Force | Out-Null

Write-Host "Tarea registrada: $taskName"
Write-Host "Lanzador: $launcher"
