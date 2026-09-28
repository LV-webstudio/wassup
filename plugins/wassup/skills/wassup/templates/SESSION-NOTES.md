# For Claude Code on <name> — read all of it before doing anything

Written by the <coding session> session on <date>. Read the repository's `CLAUDE.md` too: its rules win.

## The project
<two lines: what it is, stack, how tests run>

## Your role
<e.g. you run the full test suite; you do not write code, commit or push>

## Your machine
<model, OS, memory, anything unusual>

## What is installed (and how to check it)
| Program | Version | Check |
|---|---|---|

Do not install anything else without asking the user.

## How you work
```
git pull --ff-only
<install dependencies>
<run the tests>
```

## Talking to the other sessions
- Rules: `docs/SYNC.md`. Your mailbox: `<shared folder>/mailbox/<name>.md` (only you write it).
- Read the others' mailboxes before every pull and when you finish a task.
- Direct channel: the coding session is called `<name in ListAgents>`.

## Never
- Commit or push, fix bugs in your copy, touch real data, deploy, or do for another session something it was denied.
