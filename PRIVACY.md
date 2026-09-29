# Privacy · Wassup

*[Español más abajo](#privacidad--wassup)*

Wassup collects **no data**. It has no server, no analytics and no telemetry, and it makes no network requests.

- Everything it writes (mailboxes, status files, `wassup.json`) stays in the folder **you** choose, on your
  own machines or network share.
- Messages between sessions use Claude Code's own cross-session messaging. Between machines they travel
  through Anthropic's servers under Anthropic's terms; Wassup adds nothing to that.
- The optional Windows notification script only shows a local desktop notification.
- Wake mode (`despertar.mjs`) reads your local Claude Code conversation files only to find a session by name; it copies and sends nothing.
- Incidents (`log`/`report`) are off unless the project turns them on. They stay in your folder, are filtered
  (no e-mails, phone numbers, tokens or absolute paths), are deleted after 90 days, and are never sent: you
  decide whether to share a report, by hand.

LV-Webstudio does not receive, store or process any information from people who use Wassup.
Questions: open an issue at https://github.com/LV-webstudio/wassup/issues

---

# Privacidad · Wassup

Wassup **no recoge ningún dato**. No tiene servidor, ni analítica, ni telemetría, y no hace peticiones de red.

- Todo lo que escribe (buzones, estados, `wassup.json`) se queda en la carpeta que **tú** eliges, en tus
  equipos o en tu carpeta compartida.
- Los mensajes entre sesiones usan la mensajería propia de Claude Code. Entre equipos pasan por los servidores
  de Anthropic con sus condiciones; Wassup no añade nada.
- El script opcional de avisos de Windows solo muestra una notificación local.
- El modo despertar (`despertar.mjs`) lee tus conversaciones locales de Claude Code solo para encontrar una sesión por su nombre; no copia ni envía nada.
- Las incidencias (`log`/`report`) están apagadas salvo que el proyecto las encienda. Se quedan en tu carpeta,
  pasan un filtro (sin correos, teléfonos, tokens ni rutas absolutas), se borran a los 90 días y nunca se
  envían: compartir un reporte lo decides tú, a mano.

LV-Webstudio no recibe, guarda ni trata ninguna información de quien usa Wassup.
Dudas: abre una *issue* en https://github.com/LV-webstudio/wassup/issues
