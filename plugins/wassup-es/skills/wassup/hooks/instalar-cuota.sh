#!/usr/bin/env sh
# Instala la barra de estado de cuota de Wassup (Mac/Linux). Un solo paso:
#   sh instalar-cuota.sh <carpeta común>
# Copia cuota.mjs a ~/.claude/wassup/, hace copia de settings.json y no pisa un statusline existente.
set -eu
ROOT="${1:-}"
[ -n "$ROOT" ] || { echo "Uso: sh instalar-cuota.sh <carpeta común>" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Hace falta Node 18+ (node no está en el PATH)." >&2; exit 1; }
AQUI="$(cd "$(dirname "$0")" && pwd)"
for c in "$AQUI/../scripts/cuota.mjs" "$AQUI/cuota.mjs"; do [ -f "$c" ] && ORIGEN="$c" && break; done
[ -n "${ORIGEN:-}" ] || { echo "No encuentro cuota.mjs junto al instalador." >&2; exit 1; }
DEST="$HOME/.claude/wassup"
mkdir -p "$DEST"
cp "$ORIGEN" "$DEST/cuota.mjs"
node "$DEST/cuota.mjs" install --root "$ROOT"
