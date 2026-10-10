# Wassup

![Wassup: Claude Code sessions that talk to each other](https://raw.githubusercontent.com/LV-webstudio/wassup/main/assets/banner.jpg)

*[Leer en español](README.es.md)*

A Claude Code skill that lets **several Claude Code sessions on different machines** (Windows PCs, Macs,
Linux boxes) work on the same project without stepping on each other, and talk to each other — **with no
server**.

- **One writer per file.** Every file (code, mailbox, status) has a single owner; the others only read it.
  There is never a conflict to resolve.
- **Two channels.** Short notices over Claude Code's own cross-session messaging (Remote Control +
  `SendMessage`); everything that matters in a **written, numbered mailbox** in a shared folder, with
  "read up to #N" acknowledgements.
- **Git discipline.** One session writes code and pushes; the others pull with `--ff-only`, have push
  disabled, and tie every test result to the commit they tested.
- **The human decides.** Product decisions, real data, deployments, money and permissions are never settled
  between sessions, and one session never does for another what that one was denied.

It came out of a real project: a PC with 8 GB of RAM writing code, and a Mac running the full end-to-end
test suite the PC could not fit in memory.

## Status
Version 0.8.1 · packaged as a Claude Code plugin · field-tested with **three sessions on two machines**
(Windows 11 + macOS 13), 15 automated tests.

## Install
**As a plugin** (recommended; updates with `claude plugin update`). This repository is its own marketplace:

```
claude plugin marketplace add LV-webstudio/wassup
claude plugin install wassup@wassup       # English
claude plugin install wassup-es@wassup    # Spanish
```

**By hand**, copy one language variant into your user skills folder:

```
cp -r plugins/wassup/skills/wassup ~/.claude/skills/wassup       # English
cp -r plugins/wassup-es/skills/wassup ~/.claude/skills/wassup    # Spanish
```

Then, in each Claude Code session, say **"wassup"** (or "read the mailbox", "talk to the other session").

## Set up in 5 minutes
1. Pick a name and a role for each session (`pc` writes code, `mac` runs tests…).
2. Create a shared folder every machine can reach (SMB share on the local network is enough).
3. Inside it: a bare git repository if there is code, `mailbox/`, and one `STATUS-<name>.md` per session.
4. Copy `templates/SYNC.md` into the repository as `docs/SYNC.md` and fill in the tables.
5. Turn on Remote Control in every session and check with `ListAgents` that they see each other.

Templates: `SYNC.md` (rules of the project), `MAILBOX.md`, `STATUS.md`, `SESSION-NOTES.md` (onboarding for a
new session).

## What code it runs
Wassup has no MCP servers, no background processes and no hooks that turn on by themselves. It ships three
small, readable scripts; nothing is minified or downloaded:

| Script | When it runs | What it does | Network |
|---|---|---|---|
| `scripts/wassup.mjs` (Node 18+, no dependencies) | Only when Claude runs it through Bash, under your normal permission prompts | Reads and writes the mailbox, status files and `wassup.json` **inside the folder you pass with `--root`**; with `--commit auto` it reads the current commit with `git rev-parse`; `health` runs read-only system commands (`vm_stat`, `sysctl`, `pmset` on macOS · one PowerShell CIM query on Windows · `/proc` on Linux · `docker info` if Docker is there), never elevated, and writes `health-<me>.json` with figures only (no processes, paths or users; the machine is a short hash of its name); `log` and `report` (only if the project turns incidents on) write `incidents/<me>.jsonl` and an anonymised `report-<date>.md` in that folder and send nothing | None |
| `scripts/despertar.mjs` (Node 18+, no dependencies) | Only when Claude runs it through Bash (wake mode, §7 bis) | Reads your local conversation files in `~/.claude/projects/` **only to find** the session with that name and its folder (nothing is copied or sent), then opens a new console running `claude --resume <id>` with the `CLAUDE_*` variables removed | None |
| `hooks/notify-windows.ps1` (PowerShell) | Only if **you** add it as a `Notification` hook in your own settings | Shows a local Windows desktop notification | None |
| `scripts/wassup-hooks.mjs` (Node 18+, no dependencies) | Only if **you** add it as a hook (see "Optional hooks") | `acuse`, `ordenes`, `secretos`, `hora`: write only to `ACUSES/` and `ORDENES/` in the shared folder, or block/extend a message; without `--root` they do nothing | None |
| `scripts/cuota.mjs` + `hooks/instalar-cuota.sh` / `.ps1` | Only if **you** run the installer | Status bar: reads `rate_limits` from the statusline and writes `cuota.json` in the shared folder; the installer backs up `settings.json` and keeps an existing statusline | None |

None reads credentials or environment secrets; apart from `despertar.mjs` finding a session in your own conversation files, none reads files outside the chosen folder. See also [PRIVACY.md](PRIVACY.md).

## Optional hooks

None turns on by itself; you add them in your own `settings.json` (`<path>` = where you copied `scripts/`, `<shared>` = the shared folder).

| Hook | Event | What it does |
|---|---|---|
| `node <path>/wassup-hooks.mjs acuse --root <shared> --me <session>` | `UserPromptSubmit` or `SessionStart` | For each message addressed to you, leaves `ACUSES/RECIBIDO-<sender>-<n>-<me>.txt` ("RECIBIDO sender#n"). The sender lists what is still pending with `sin-acuse --me <sender>`. |
| `… ordenes --root <shared> --me <session>` | `UserPromptSubmit` | Copies every order the user types to `ORDENES/`: date, session, text and a signature (an integrity hash that detects edits; it does not authenticate). A pasted secret is masked. |
| `… secretos --root <shared>` | `PreToolUse`, matcher `SendMessage` | Blocks (exit 2 with a reason) messages containing tokens, private keys or `password:`/`clave=`; reuses the `scrub` patterns. |
| `… hora --root <shared>` | `PreToolUse`, matcher `SendMessage` | Appends `[hora: YYYY-MM-DD HH:MM ±HH:MM]` (system clock) to the end of the message, only once. |

### Quota bar
`sh hooks/instalar-cuota.sh <shared>` (Mac/Linux) or `powershell -File hooks\instalar-cuota.ps1 -Root <shared>` (Windows). Copies `cuota.mjs` to `~/.claude/wassup/`, saves a single original `settings.json.wassup-bak-<date>` copy (no new one on reinstall) and sets the statusline; if you already had one it is kept and still shown. Writes `cuota.json` with a `nivel`: **VERDE** (<70 % weekly, normal pace), **ÁMBAR** (≥70 % or pace ≥1.15), **ROJO** (≥85 % or pace ≥1.5), **NEGRO** (≥97 % weekly or the 5 h window nearly full). Pace = % used / % of the week elapsed. `rate_limits` exists only with a Claude.ai subscription.

## What it is not
It is a working convention, not new technology. If you need file locks, a searchable message server or
automatic orchestration, look at MCP-based agent mail servers or orchestration tools; Wassup is the
lightweight option for a few machines and a human in the loop.

## Licence
MIT — see [LICENSE](LICENSE). © 2026 LV-Webstudio (Speccy81).
