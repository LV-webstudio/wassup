# Changelog

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
