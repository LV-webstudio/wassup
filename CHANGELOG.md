# Changelog

Wassup comes in two editions. The **Basic** edition (MIT, this repository) is `scripts/wassup.mjs` on its own. The
**Full** edition (by Shania Webstudio, not open source) adds `scripts/wassup-completa.mjs` next to it; the core loads it through
its extension point when it is there. Items marked *(Full)* are only in the Full edition.

## 0.13.0 · unreleased
- **Quota bar** (`scripts/cuota.mjs`, installers `hooks/instalar-cuota.sh` and `.ps1`, one step): reads `rate_limits` from the
  statusline and writes `cuota.json` in the shared folder (GREEN/AMBER/RED/BLACK by weekly % and pace). Backs up `settings.json`
  once and keeps an existing statusline running.
- **Optional hooks** (`scripts/wassup-hooks.mjs`, opt-in, nothing turns on by itself): `acuse` (RECEIVED note in `ACUSES/`
  and `sin-acuse`), `ordenes` (signed copy of the person's orders in `ORDENES/`), `secretos` (blocks keys and passwords in
  `SendMessage`, with the same patterns as `scrub`) and `hora` (system time added to each message).
- **Voice with turns** (`scripts/voz.mjs`): several sessions share one speaker and only one speaks at a time (a TURNO
  folder in the shared folder; a turn older than 40 s is taken as abandoned). No turn in 120 s: it does not speak and logs it.
  Quiet hours 23-8 unless `--emergencia`; cut at 30 s; log in `VOZ/registro-voz.txt`. Windows (System.Speech), macOS (`say`)
  and Linux (`spd-say`), with the text passed as data, never inside a shell command.
- **Loose hooks** (`scripts/hooks/`, opt-in): block keys in `SendMessage` (11 patterns, says the kind, never the value),
  system time and short id at the head of each message, «RECEIVED <id>» acknowledgement, and the person's ORDERS signed with
  HMAC (a local secret file) so another session can tell a real order from a colleague's request.
- **No hook returns «allow»**: the `hora` hook only warns by default; with `WASSUP_HORA=reescribir` it rewrites with «ask», so
  the permission question is still shown.
- Quota fixes: input with a BOM is read (and a warning if it is not JSON); a single backup of `settings.json`; `resets_at`
  accepts seconds, milliseconds and ISO 8601; the install message shows the real backup path.
- `wassup.mjs` exports `TOKEN_PATTERNS`, `PASSWORD_PATTERNS` and `findSecrets`.

## 0.12.1 · 2026-10-04
- The maker is now called **Shania Webstudio** (it was LV-Webstudio): README, licences, plugin manifests and
  file headers. The GitHub account and its URLs stay the same for now.
- README: a **Trademarks** note (the MIT licence covers the code, not the names or logos).

## 0.12.0 · 2026-10-03
Approved by the team's senate on 2026-10-02: improvements that help without adding a step to each message.
- **One version for everyone**: the mailbox carries «Wassup: <version>»; `send`, `health` and `status` warn when the
  shared folder mixes versions (locks and notices only work if every session has the same one). `send` says it once a day per
  session (and again if the mix changes), not on every message.
- **Network and shutdowns**: `red` writes this machine's private IPv4 and the time, both taken from the system (never
  typed), in my mailbox; `init` and `retomado` do it on their own; `red --apago HH:MM` announces a planned shutdown or
  restart. `status` shows them and marks «NO NEWS» after `config --latido` minutes (240) without network line, message
  or health. Physical interfaces win over virtual ones (VMs, containers, VPN). **Off by default**: it writes the private IP
  and the time in the shared folder, which may be synced to the cloud; `config --red on` turns it on for the whole project.
- **Decisions**: a subject starting with «decision:» marks a decision of the person in charge (literal quote); `unread`
  highlights it.
- **Hashes**: `huellas <folder>` writes HUELLAS.txt (sha256 of each file) or, if there is one, checks it (exit 1 on any
  change, missing or new file) and never rewrites it without `--sellar`. It reads in 1 MB blocks (big files do not load
  whole), says apart the lines that point outside the folder, and counts the symbolic links it does not follow.
- **Known warnings**: AVISOS.md in the shared folder (written by the coordinator, one «- » line each): `health` shows
  the lines that are new since that session last saw them.
- *(Full)* **Turns**: `turno pedir|dar|liberar|ver`, one heavy job at a time with a visible queue; only the coordinator
  grants it, one at a time, by number (no clocks compared between machines), and can take it back from a session that
  is down (`turno quitar`).
- *(Full)* **Watch**: `vigilar -- <command>` waits for the entry RAM without launching anything, samples every 10 s (half
  that below twice the cut) and, below the cut, kills the whole process tree (an emulator's JVM and orphaned grandchildren
  included, through the process group on macOS/Linux). RAM is measured exactly like `health` (vm_stat on macOS) and the
  default thresholds are health's (entry «tight» 2 GB, cut «minimum» 1 GB). If vigilar itself is interrupted (Ctrl-C,
  kill, terminal closed) it kills the tree first and exits 130/143/129. At the end it checks that no child is left
  alive and notes the run in the history (never the command). `--turno`: only with the turn. A commit whose hook runs
  tests goes inside it. Interactive commands (an editor, a prompt) do not belong inside vigilar.
- Mixed versions: a coordinator still on 0.11 that runs `config` drops the new keys (`red`, `latidoMin`): update the
  coordinator first.
- *(Full)* **Fix**: `awake` did not start (a missing import, and the watcher was launched from a file with no command
  line); now the core launches it. A real test covers it.
- `init --caps` refuses anything that looks like a credential: only names and «cred:<project>» with the project
  NAME (it accepted «cred:EXAMPLE-KEY-123»).
- *(Full)* Without the core, or with an older one, the Full edition says which core it needs (now ≥ 0.12.0)
  instead of a Node error; with an older core next to it, `--version` and the Basic commands keep working and only the
  Full commands say which core they need.

## 0.11.0 · 2026-10-02
- **Secrets never travel** (M51): `send` (subject, body, `--body-file`, expect) and `log` refuse an obvious secret
  (private keys, service-account JSON, GitHub/Slack/AWS/Google/Anthropic tokens and keys, JWTs, «password = …»
  assignments) and say the field, the line and the type, never the value. A Spanish ID (DNI/NIE, with its check
  letter) or an IBAN (with its check digits) only warns. `unread` and `status` point out what is already written in
  mailboxes and STATUS files (file and line), and `barrer <folder>` sweeps any folder with the same engine (exit 1
  on a secret). Commit and file hashes do not count.
- **Compacting with the memory in order** (M64): `compactar --memoria <folder>` refuses unless `retomar.md` is at
  most 30 minutes old, quotes the repository's current commit (without a repository the date is enough) and the
  memory sweep finds no secret (file and line, never the value); then it marks the session as «compacting» and
  tells the coordinator. `retomado` closes it. After 30 minutes without `retomado`, `remind` tells the coordinator
  and the session itself; `status` shows it.
- **«Proof:» when something is done** (M67): a message that says «done» (or «hecho», «feito», «fait», «fatto»,
  «erledigt»…) without a line starting with a proof label (Prueba, Proof, Prova, Preuve, Nachweis, Bewijs, Dowód)
  gets a notice; `config --prueba estricta` blocks it, `off` turns it off. Wassup's own automatic notices are not
  checked. In Dutch and Polish only the label is recognised, not the trigger words.
- **The machine is declared, never read** (M69): `init` needs `--maquina <name>` (your own name for the machine,
  never a person's) unless the mailbox already has one. The machine id is its short hash; Wassup no longer reads
  the system name.
- **Two editions**: the core is the Basic edition; the Full edition lives in its own module and is loaded only when
  present. Without it, its commands say so clearly and write nothing; help and `status` do not mention them.
- Examples in comments and tests are neutral (no customer names).
- **Upgrading from 0.9.x**: run `init --root <folder> --name <me> --maquina <machine>` once in every session (your
  mailbox has no machine yet, so `init` asks for it). The wake-mode helper (`despertar.mjs`) is no longer part of
  the Basic plugin: open a closed session by hand from its own folder, never with a bare `claude` launched from
  another session. Mailboxes, STATUS files and `wassup.json` are read as before.

- **Fixed before release**: the commands did nothing (and exited with 0) when the script was run through a
  symbolic link or a junction, for example macOS temporary folders (`/var` → `/private/var`) or a linked skills
  folder; the real paths are compared now.
- **Fixed before release**: `unread` of a session that is registered but has not run `init` yet no longer
  crashes, and `status` counts what is waiting for it (it said 0).
- *(Full)* Licence: the Full files and the plugin manifests now say so (`MIT AND LicenseRef-Wassup-Completa`, with
  `LICENSE-COMPLETA.md` inside each plugin); the Basic edition stays MIT.

## 0.10.0 · 2026-09-30
- **Mailbox, less friction** (asked by the coordinator and the Mac after a night of real use): `send` prints the
  line to paste in the direct notice, so the number quoted is the real one; `send --re N` checks that #N exists and
  was written to you, and with a single recipient marks it as read; `unread --resumen` (one line per message) and
  `show --de <session> --num N` (one message whole, no awk); `ack` lists what you have read that still expects an
  answer; dates carry the time zone (`+02:00`), older ones are still read as local time.
- **Manageable batches** (M24) *(Full)*: one lock per machine for heavy jobs (atomic, abandoned after 30 min or when
  its process is gone, never removed from a live session) and a runner that takes the lock, measures health before,
  during and after, writes the type, duration and result to the health history (never the command or paths) and
  releases the lock even on failure; the stable limit per task type; `status` shows the locks.
- Waiting for «ok» and measuring the repository disk *(Full)*; the **source of the load** by category (sync,
  containers, browser, dev tasks, system), never process names.
- **Wassup errors to the maintainer** (M25, opt-in) *(Full)*: sanitised, once per 24 h per error, and not sent at
  all when the filter had to hide something.
- The guide asks for `--body-file` in zsh.
- **Machine awake while Wassup is in use** (the user's rule, M36) *(Full)*: keeps screen and machine awake through a
  background watcher (`caffeinate -dimsu`, `SetThreadExecutionState` renewed every 60 s, `systemd-inhibit`), never
  changing power settings; `status` shows «awake: yes/no» and `init`/`health` remind when it is off.
- `config` prints readable lines in the project language.

## 0.9.2 · 2026-09-30
- The rest of what the user reads in the project language: the `status` line (`último` / `sin leer`,
  `compartida`) and the `init` and `register` confirmations (`coordinadora`, `sesiones`) in Spanish projects.

## 0.9.1 · 2026-09-29
- Found by the coordinator on the first real run: the `health` line says when this sample differs from the
  state (hysteresis: it changes after two samples in a row); `config` shows `incidents: on|off` and `status` tells
  whether incidents are on; `config` and `register` without `--by` say that `--by` is missing.
- **Errors in the project language** (the user's rule: everything the user reads, in Spanish): the 36 script errors
  exist in Spanish and English; the CLI prints them in the language of `wassup.json` (`--root`), else `WASSUP_LANG`,
  else the system language. `WassupError.message` stays in English for scripts and tests.

## 0.9.0 · 2026-09-29
- **Resources** (`wassup.mjs health`, SKILL §5b / §5 bis): measures available RAM (`vm_stat` on macOS), swap,
  load per core, repo and shared-folder disk, temperature (best effort, never elevated) and the Docker VM; writes
  `health-<me>.json` (figures only) and exits 0 ok · 1 tight · 2 saturated. Hysteresis (two samples in a row),
  one `[resources] saturated` / `[resources] ok` notice per episode and per machine, `--busy`/`--needs`/`--watch`.
  Thresholds in `wassup.json` (`config --ram-min --ram-tight --load-max --disk-repo-min --disk-shared-min
  --free-remind`).
- **Capabilities** (`init --caps "playwright, cred:<project>"`): one line in your own mailbox, shown by `status`.
- `status` shows state, "free N min", RAM, shared disk, heavy job and capabilities. The coordinator's `remind`
  adds "free with resources" and "imbalance" (never for deploys or production); a saturated session gets twice
  the patience. `--version`.
- **Incidents and reports** (`wassup.mjs log` / `report`, SKILL §5c / §5 ter), opt-in per project
  (`config --incidents on`): each session appends to its own `incidents/<me>.jsonl` (schema
  `wassup-incidencia/1`, 9 types, e-mails, phones, tokens and absolute paths removed, 90 days). `report` writes an
  anonymised `report-<date>.md` (`--retro`, `--issue`) for the user to read; nothing is ever sent.

## 0.8.2 · 2026-09-29
- **Sharing out work, "free" and resources** (SKILL §5b / §5 bis), guide only: write "free" when a task ends;
  one capabilities line in your own mailbox (never secrets); the coordinator hands work to a free session before
  doing it itself or launching its own agent (never production or credential-bound work); check available
  memory and disk before anything heavy (`vm_stat` on macOS, not `os.freemem()`), and send
  `[resources] saturated` instead of launching it. The `w health` command comes in 0.9.0.

## 0.8.1 · 2026-09-29
- **Permissions when launching a task** (SKILL §3e / §3 quinquies): list the sensitive actions a task may need,
  ask the user once which ones they authorise for the session, propose the narrowest permission rule (the user
  applies it, or asks for it to be written to the project's `settings.local.json`, never the global one), and
  never retry or hand to another session what the permission classifier denied. Done before the user leaves.
- Quote a mailbox message with the number `send` returns, never one worked out before sending.

## 0.8.0 · 2026-09-29
- **Offers of help by workload** (`wassup.mjs assist`, SKILL §3d / §3 quater): with the same load as the
  reminders, a nearly free session (load ≤ 2) sees which ones are overloaded (load ≥ 6) and offers to take
  work off them, at most once every 2 hours per session (`assist-<me>.json`). The overloaded one decides and
  writes in its own mailbox which task and files change owner: one writer per file still holds.
- `config --assist-min --assist-own --assist-cooldown` (coordinator).

## 0.7.1 · 2026-09-29
- Found by a second session on the first real run: "I expect from you: nothing" no longer counts as a request;
  `remind --close-all` closes everything pending when moving a mailbox from before 0.7 (answers there did not
  quote the number); `--agent` accepts several names separated by `|`, because a session's ListAgents name
  depends on the machine (its `/rename` name locally, its title over Remote Control).

## 0.7.0 · 2026-09-29
- **Reminders by waiting time × workload** (`wassup.mjs remind`, SKILL §3c / §3 ter). A message is pending
  until the recipient **answers** it (when it carries "I expect from you") or **reads** it (when it does not).
  The threshold is `base × (1 + load/5)` minutes, capped at `max` (60 and 480 by default), where load is the
  recipient's unread messages plus the answers others expect from them: the busier a session, the more
  patience. Notices at 1×, 2× and 4× the threshold.
- Two modes, set by the coordinator with `wassup.mjs config`: `escalate` (default; the 3rd notice goes to the
  person) and `auto` (every notice is a direct reminder; the person is never bothered).
- `send --re 4,6` writes "In reply to: #4, #6"; hand-written lines starting with "re …#n" also count.
- Given notices are kept in `reminders-<me>.json` (one writer, as always), so none is repeated.

## 0.6.0 · 2026-09-29
- **Wake mode** (§7 bis, `scripts/despertar.mjs`): one session opens another that is closed, in a new console, resuming its conversation by name or id, with the `CLAUDE_*` variables removed (otherwise the new one is a child session that saves no transcript and nobody can reach). Tested on Windows waking a real closed session.
- `despertar.mjs` only opens a session that is **named** that (`/rename` or a saved ListAgents name). If the name only appears inside other conversations it lists them and exits with code 3 asking for `--id` (opening the wrong session is worse than none); code 2 suggests `/rename` when nothing matches. Folder paths are passed safely on macOS (`quoted form of`) and Linux (as the terminal cwd). Both plugins accept `--name`/`--dry-run` and `--nombre`/`--prueba`. Tested on Windows 11 and, dry-run, on macOS 13.7 by a second session.

## 0.5.3 · 2026-09-29
- A README inside each plugin folder (English in `wassup`, Spanish in `wassup-es`) so each directory listing shows its own language; banner and links use absolute GitHub URLs.
- README section "What code it runs".

## 0.5.2 · 2026-09-29
- Privacy notice (`PRIVACY.md`: Wassup collects no data) and support, documentation and privacy links in both plugin manifests.

## 0.5.1 · 2026-09-29
- Plugin icon (`.claude-plugin/icon.png`, 512×512) and README banner (`assets/banner.jpg`).

## 0.5.0 · 2026-09-29
- Packaged as a Claude Code plugin. This repository is its own marketplace (`wassup`) with two plugins:
  `wassup` (English) and `wassup-es` (Spanish).
- `claude plugin validate --strict` passes for the marketplace and both plugins.
- The Windows notification hook ships with the skill but is **not** registered automatically.
- New test: the plugin copies of the script and hook must match the sources, and versions must agree (15 tests).

## 0.4.0 · 2026-09-28
- Field test with three sessions on two machines (Windows 11 + macOS 13).
- "Read up to #N" now means "reviewed up to #N"; round-trip check of session names; advice to restart
  long-running sessions after updating Claude Code.

## 0.3.0 · 2026-09-28
- `wassup.mjs` script (Node 18+, no dependencies): `init`, `register`, `send`, `unread`, `wait`, `ack`, `status`.
- Native Windows notifications (`hooks/notify-windows.ps1`).

## 0.2.0 · 2026-09-28
- Templates (sync rules, mailbox, status, session notes) in English and Spanish.

## 0.1.0 · 2026-09-28
- First version: one writer per file, direct channel over Remote Control and a numbered mailbox.
