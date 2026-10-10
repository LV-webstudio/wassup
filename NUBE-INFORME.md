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

## Correcciones tras la revisión
Revisión en Windows: 57/59 pasaban y `instalar-cuota.ps1` funcionaba. Cambios (en `cuota.mjs` y sus copias en los dos plugins):
1. **BOM**: se quita al leer la entrada del statusline (y `settings.json`/config); si aun así no es JSON, la barra muestra «⚠ cuota: la entrada del statusline no es JSON válido». Entrada vacía: sin aviso.
2. **Copia de seguridad**: solo se crea la original; si ya existe `settings.json.wassup-bak-*`, se reutiliza y no se crea otra. `instalar` devuelve la ruta real.
3. **«*» literal**: el mensaje del instalador ya da la ruta concreta de la copia (README y README.es ajustados).
4. **`resets_at`**: acepta segundos, milisegundos (≥1e11), cadena ISO 8601 y cadena numérica; si no se entiende, el ritmo queda en `null`.
5. **T7**: la causa **no era Windows**: el test usaba la fecha fija 29/09/2026 y `remind --mark` borra avisos de más de 7 días respecto a `Date.now()`, así que fallaba en cualquier sistema pasada esa semana (también en Linux aquí). En vez de omitirlo en Windows, el reloj de `health.test.mjs` es ahora relativo a «ahora»; T7 pasa.
Pruebas nuevas (4): BOM+aviso, copia única, mensaje sin «*», `resets_at`. `node --test scripts/*.test.mjs`: 62 pasan, 1 falla (**T10**, ya fallaba antes: depende del entorno —su comprobación de «no debe aparecer: vm» salta por el nombre/virtualización de esta máquina—; no tocado).

## Queda / límites
- `instalar-cuota.ps1` **no se ha podido ejecutar** (no hay PowerShell en la nube); comparte toda la lógica con el `.sh` vía `cuota.mjs install`, que sí está probado. Conviene una prueba real en Windows.
- Los nombres de campo de `SendMessage` (`message`/`content`/`body`/`text`) y el formato exacto de `rate_limits` se han asumido de la documentación; falta verificarlos con una sesión real.
- El hook de acuse deja el acuse al empezar turno/sesión del receptor, no en el instante exacto de recibir (Claude Code no ofrece evento de «mensaje recibido»).
- Umbrales de nivel de cuota (70/85/97 % y ritmo 1,15/1,5) son una propuesta ajustable.
- `hooks/hooks.json` de plugin no se ha creado a propósito, para no activar nada por defecto.

## Revisión de privacidad
Revisé el diff completo contra `main` (y de nuevo el de estas correcciones) buscando nombres, correos, IPs, rutas privadas, dominios y claves: no hay ninguno. Los únicos tokens son falsos y genéricos en las pruebas (`ghp_abcdefghijklmnop1234`, etc.) y las rutas de las pruebas son temporales.
