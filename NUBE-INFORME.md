# Informe de la sesión en la nube · rama `nube-2026-10-11`

## Diagnóstico (Speccy81 ligero)
Repo con un script maestro (`scripts/wassup.mjs`) copiado idéntico a dos plugins (`wassup`, `wassup-es`), un hook (`notify-windows.ps1`) y pruebas con `node --test`. Sin `hooks.json`: nada se activa solo (lo dice el README). Decisión: scripts nuevos en `scripts/` y `hooks/`, copiados a los dos plugins, y hooks **opt-in** documentados en el README; el test de copias idénticas los cubre.

## Hecho, con pruebas
| # | Tarea | Ficheros | Pruebas |
|---|---|---|---|
| 1 | Barra de cuota + instalador | `scripts/cuota.mjs`, `hooks/instalar-cuota.sh`, `hooks/instalar-cuota.ps1` | `cuota.test.mjs` (5): niveles VERDE/ÁMBAR/ROJO/NEGRO, escritura de `cuota.json`, copia de `settings.json`, conserva y sigue mostrando el statusline previo, idempotente, instalador `.sh` real con HOME aislado |
| 2 | Acuse de recibo | `wassup-hooks.mjs acuse` / `sin-acuse` | `hooks.test.mjs`: `RECIBIDO` en `ACUSES/`, idempotente, mensajes a `all`, lista de pendientes |
| 3 | ORDENES con firma | `wassup-hooks.mjs ordenes` | fecha, sesión, texto, firma (hash de integridad, no autentica); un secreto pegado se tapa |
| 4 | Bloqueo de secretos | `wassup-hooks.mjs secretos` + `findSecrets`/`TOKEN_PATTERNS` exportados de `wassup.mjs` (reutiliza el detector de `scrub`) | tokens, claves PEM, `password:`/`clave=` bloqueados (exit 2); texto normal pasa |
| 5 | Hora | `wassup-hooks.mjs hora` | añade `[hora: …]` una sola vez vía `updatedInput` |

Docs: `README.md`, `README.es.md` (tabla «qué código ejecuta» + sección de hooks/cuota) y `CHANGELOG.md` («Sin publicar»). Versión publicada, `main`, tags y PR: sin tocar.

Resultado de `node --test scripts/*.test.mjs`: 57 pasan, 2 fallan. Los 2 fallos (`T7`, `T10` de `health.test.mjs`) **ya fallaban antes de mis cambios** en este entorno (medición de recursos del sistema); no los he tocado.

## Queda / límites
- `instalar-cuota.ps1` **no se ha podido ejecutar** (no hay PowerShell en la nube); comparte toda la lógica con el `.sh` vía `cuota.mjs install`, que sí está probado. Conviene una prueba real en Windows.
- Los nombres de campo de `SendMessage` (`message`/`content`/`body`/`text`) y el formato exacto de `rate_limits` se han asumido de la documentación; falta verificarlos con una sesión real.
- El hook de acuse deja el acuse al empezar turno/sesión del receptor, no en el instante exacto de recibir (Claude Code no ofrece evento de «mensaje recibido»).
- Umbrales de nivel de cuota (70/85/97 % y ritmo 1,15/1,5) son una propuesta ajustable.
- `hooks/hooks.json` de plugin no se ha creado a propósito, para no activar nada por defecto.

## Revisión de privacidad
Revisé el diff completo contra `main` buscando nombres, correos, IPs, rutas privadas, dominios y claves: no hay ninguno. Los únicos tokens son falsos y genéricos en las pruebas (`ghp_abcdefghijklmnop1234`, etc.) y las rutas de las pruebas son temporales.
