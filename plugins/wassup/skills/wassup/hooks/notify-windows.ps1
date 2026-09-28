# Wassup · aviso nativo de Windows para Claude Code (sin instalar nada: API de notificaciones de Windows).
# © 2026 LV-Webstudio (Speccy81) · MIT
#
# Uso como hook de Claude Code (lee el JSON del evento por la entrada estándar):
#   powershell -NoProfile -ExecutionPolicy Bypass -File notify-windows.ps1
# Uso a mano:
#   powershell -NoProfile -File notify-windows.ps1 -Title "Claude Code" -Message "Hola"
param(
  [string]$Title = '',
  [string]$Message = ''
)

$ErrorActionPreference = 'SilentlyContinue'

# Datos del evento del hook (Notification, Stop…), si llegan por la entrada estándar.
$evento = $null
if (-not $Message -and [Console]::IsInputRedirected) {
  try { $evento = [Console]::In.ReadToEnd() | ConvertFrom-Json } catch { $evento = $null }
}

$proyecto = ''
if ($evento -and $evento.cwd) { $proyecto = Split-Path -Leaf $evento.cwd }

if (-not $Title) {
  $Title = if ($proyecto) { "Claude Code · $proyecto" } else { 'Claude Code' }
}
if (-not $Message) {
  if ($evento -and $evento.message) { $Message = [string]$evento.message }
  elseif ($evento -and $evento.hook_event_name -eq 'Stop') { $Message = 'Ha terminado y espera tu respuesta.' }
  else { $Message = 'Te necesita.' }
}

# Texto seguro para XML (el mensaje puede traer < > &).
function Escapar([string]$s) { [System.Security.SecurityElement]::Escape($s) }

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml(@"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>$(Escapar $Title)</text>
      <text>$(Escapar $Message)</text>
    </binding>
  </visual>
</toast>
"@)

# Identificador de PowerShell (ya registrado en Windows): no hace falta instalar ni registrar nada.
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
$toast = New-Object Windows.UI.Notifications.ToastNotification $xml
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
exit 0
