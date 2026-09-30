# Changelog

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
