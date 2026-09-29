# Wassup

![Wassup: Claude Code sessions that talk to each other](https://raw.githubusercontent.com/LV-webstudio/wassup/main/assets/banner.jpg)

*[Leer en español](https://github.com/LV-webstudio/wassup/blob/main/README.es.md)*

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
| `scripts/wassup.mjs` (Node 18+, no dependencies) | Only when Claude runs it through Bash, under your normal permission prompts | Reads and writes the mailbox, status files and `wassup.json` **inside the folder you pass with `--root`**; with `--commit auto` it reads the current commit with `git rev-parse` | None |
| `scripts/despertar.mjs` (Node 18+, no dependencies) | Only when Claude runs it through Bash (wake mode, §7 bis) | Reads your local conversation files in `~/.claude/projects/` **only to find** the session with that name and its folder (nothing is copied or sent), then opens a new console running `claude --resume <id>` with the `CLAUDE_*` variables removed | None |
| `hooks/notify-windows.ps1` (PowerShell) | Only if **you** add it as a `Notification` hook in your own settings | Shows a local Windows desktop notification | None |

None reads credentials or environment secrets; apart from `despertar.mjs` finding a session in your own conversation files, none reads files outside the chosen folder. See also [PRIVACY.md](https://github.com/LV-webstudio/wassup/blob/main/PRIVACY.md).

## What it is not
It is a working convention, not new technology. If you need file locks, a searchable message server or
automatic orchestration, look at MCP-based agent mail servers or orchestration tools; Wassup is the
lightweight option for a few machines and a human in the loop.

## Licence
MIT — see [LICENSE](https://github.com/LV-webstudio/wassup/blob/main/LICENSE). © 2026 LV-Webstudio (Speccy81).
