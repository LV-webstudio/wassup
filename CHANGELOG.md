# Changelog

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
