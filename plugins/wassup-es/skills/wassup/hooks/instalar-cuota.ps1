# Instala la barra de estado de cuota de Wassup (Windows). Un solo paso:
#   powershell -File instalar-cuota.ps1 -Root <carpeta común>
# Copia cuota.mjs a ~\.claude\wassup\, hace copia de settings.json y no pisa un statusline existente.
param([Parameter(Mandatory = $true)][string]$Root)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Hace falta Node 18+ (node no está en el PATH).' }
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$origen = @((Join-Path $aqui '..\scripts\cuota.mjs'), (Join-Path $aqui 'cuota.mjs')) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $origen) { throw 'No encuentro cuota.mjs junto al instalador.' }
$dest = Join-Path $env:USERPROFILE '.claude\wassup'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item $origen (Join-Path $dest 'cuota.mjs') -Force
node (Join-Path $dest 'cuota.mjs') install --root $Root
