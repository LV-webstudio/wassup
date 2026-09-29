# Wassup

![Wassup: sesiones de Claude Code que se hablan entre ellas](https://raw.githubusercontent.com/LV-webstudio/wassup/main/assets/banner.jpg)

*[Read in English](README.md)*

Una skill de Claude Code para que **varias sesiones de Claude Code en distintos equipos** (PC con Windows,
Mac, Linux) trabajen en el mismo proyecto sin pisarse y se escriban entre ellas, **sin servidor**.

- **Un dueño por fichero.** Cada fichero (código, buzón, estado) tiene una sola sesión que escribe; las demás
  solo leen. Nunca hay un conflicto que resolver.
- **Dos canales.** Avisos cortos con la mensajería entre sesiones de Claude Code (Remote Control +
  `SendMessage`); todo lo importante en un **buzón escrito y numerado** en una carpeta compartida, con
  confirmación «leído hasta #N».
- **Disciplina de git.** Una sesión programa y empuja; las demás traen con `--ff-only`, tienen el push
  desactivado y atan cada resultado de pruebas al commit que probaron.
- **Decide la persona.** Decisiones de producto, datos reales, despliegues, dinero y permisos nunca se
  deciden entre sesiones, y una sesión nunca hace por otra lo que a esa se le denegó.

Salió de un proyecto real: un PC con 8 GB de memoria programando y un Mac pasando la batería completa de
pruebas de extremo a extremo que en el PC no cabía.

## Estado
Versión 0.8.1 · empaquetada como plugin de Claude Code · probada en campo con **tres sesiones en dos
equipos** (Windows 11 + macOS 13), 15 pruebas automáticas.

## Instalación
**Como plugin** (recomendado; se actualiza con `claude plugin update`). Este repositorio es su propio marketplace:

```
claude plugin marketplace add LV-webstudio/wassup
claude plugin install wassup-es@wassup    # Español
claude plugin install wassup@wassup       # Inglés
```

**A mano**, copia una de las dos variantes de idioma en tu carpeta de skills de usuario:

```
cp -r plugins/wassup-es/skills/wassup ~/.claude/skills/wassup    # Español
cp -r plugins/wassup/skills/wassup ~/.claude/skills/wassup       # Inglés
```

Después, en cada sesión de Claude Code, di **«wassup»** (o «lee el buzón», «habla con la otra sesión»).

## Montaje en 5 minutos
1. Un nombre y un papel para cada sesión (`pc` programa, `mac` prueba…).
2. Una carpeta compartida a la que lleguen todos los equipos (basta una carpeta SMB en la red local).
3. Dentro: un repositorio git *bare* si hay código, `buzon/` y un `ESTADO-<nombre>.md` por sesión.
4. Copia `plantillas/SINCRONIZACION.md` al repositorio como `docs/SINCRONIZACION.md` y rellena las tablas.
5. Activa Remote Control en todas las sesiones y comprueba con `ListAgents` que se ven.

Plantillas: `SINCRONIZACION.md` (reglas del proyecto), `BUZON.md`, `ESTADO.md`, `NOTAS-SESION.md` (arranque
de una sesión nueva).

## Qué código ejecuta
Wassup no tiene servidores MCP, ni procesos en segundo plano, ni hooks que se activen solos. Trae tres scripts
pequeños y legibles; nada está minificado ni se descarga:

| Script | Cuándo se ejecuta | Qué hace | Red |
|---|---|---|---|
| `scripts/wassup.mjs` (Node 18+, sin dependencias) | Solo cuando Claude lo lanza por Bash, con tus avisos de permiso habituales | Lee y escribe el buzón, los estados y `wassup.json` **dentro de la carpeta que indicas con `--root`**; con `--commit auto` lee el commit actual con `git rev-parse` | Ninguna |
| `scripts/despertar.mjs` (Node 18+, sin dependencias) | Solo cuando Claude lo ejecuta por Bash (modo despertar, §7 bis) | Lee tus conversaciones locales en `~/.claude/projects/` **solo para encontrar** la sesión con ese nombre y su carpeta (no copia ni envía nada) y abre una consola nueva con `claude --resume <id>`, sin las variables `CLAUDE_*` | Ninguna |
| `hooks/notify-windows.ps1` (PowerShell) | Solo si **tú** lo añades como hook `Notification` en tu configuración | Muestra un aviso local de Windows | Ninguna |

Ninguno lee credenciales ni secretos del entorno; salvo `despertar.mjs`, que busca una sesión en tus propias conversaciones, ninguno lee ficheros fuera de la carpeta elegida. Ver también [PRIVACY.md](PRIVACY.md).

## Qué no es
Es una convención de trabajo, no una tecnología nueva. Si necesitas bloqueos de ficheros, un servidor de
mensajes con búsqueda u orquestación automática, mira los servidores de correo entre agentes basados en MCP
o las herramientas de orquestación; Wassup es la opción ligera para pocos equipos y con una persona al mando.

## Licencia
MIT — ver [LICENSE](LICENSE). © 2026 LV-Webstudio (Speccy81).
