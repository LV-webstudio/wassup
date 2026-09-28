# Sync between sessions · <project>

Rule: **every file has one writer; everyone else only reads it.** Nobody resolves conflicts: stop and tell
the user. Product decisions, real data, deployments, money and permissions go to the user, never between
sessions.

## Sessions
| Name | Machine | Role | Name in ListAgents |
|---|---|---|---|
| pc | <e.g. Windows 11, 8 GB> | Writes code, commits | <session name> |
| mac | <e.g. macOS 13, 16 GB> | Runs the full test suite | <session name> |

## Who owns what
| What | Where | Writes | Reads |
|---|---|---|---|
| Code, tests, docs (including this file) | repository (`main`) | **pc only** (commit → hook pushes to the shared folder) | others (`git pull --ff-only`) |
| Requests for another session | sender's mailbox | the sender | the recipient |
| Status and results | `STATUS-<name>.md` in the shared folder, outside the repo | that session only | everyone |
| Change proposals | `from-<name>/*.patch` in the shared folder | that session only | the code owner, who applies them with its own commit |
| Each session's memory | `~/.claude` on each machine | each its own | — |
| Real / personal data | <where> | <who> | **nobody else** |

## The cycle
1. The coding session commits → the hook pushes → it writes the request in its mailbox and sends a direct notice.
2. The other session finishes what it is doing → `git pull --ff-only` → notes the commit it will test → does
   the task → writes the result with that commit.
3. Bugs are described (test, error, proposal) or sent as `.patch`; the code owner fixes and replies.

## Safeguards
- Push disabled where no code is written: `git remote set-url --push origin NO-PUSH-FROM-<NAME>`.
- Clean tree before every pull; `--ff-only` always.
- Untracked local artefacts (`node_modules`, seeds, test results, `.env.local`) stay on each machine.

## Channels
- Direct: Remote Control + `SendMessage` (short notices).
- Mailbox: `mailbox/` in the shared folder (everything that matters, numbered, with "Read … up to").
