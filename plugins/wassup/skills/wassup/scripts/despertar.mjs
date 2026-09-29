#!/usr/bin/env node
// Wassup · wake mode
// Opens a closed Claude Code session in a new console, resuming its conversation.
//
//   node despertar.mjs --name shop-mac            find the session by its name (/rename, or its ListAgents name if saved)
//   node despertar.mjs --id 0f3c9a2e-…              by conversation id
//   node despertar.mjs --name shop-mac --dry-run  only say what it would open, open nothing
//   (Spanish aliases also work: --nombre, --prueba)
//
// Why it is needed: if a session launches `claude` directly, the new one inherits its CLAUDE_*
// variables (including CLAUDE_CODE_CHILD_SESSION), takes itself for a child session, does NOT save
// its transcript and cannot be reached by the others. Here it is launched with those variables
// removed, in the folder where the conversation was started (otherwise --resume cannot find it).
//
// It only opens a session that is NAMED like that. If a name only appears inside other
// conversations, it lists them and asks for --id: opening the wrong session is worse than none.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const val = (...ks) => { for (const k of ks) { const i = args.indexOf(k); if (i >= 0) return args[i + 1]; } return undefined; };
const name = val("--name", "--nombre"), wantedId = val("--id"), dryRun = args.includes("--dry-run") || args.includes("--prueba");
if (!name && !wantedId) { console.error("Usage: despertar.mjs --name <session> | --id <uuid> [--dry-run]"); process.exit(1); }

const base = path.join(os.homedir(), ".claude", "projects");
const me = process.env.CLAUDE_CODE_SESSION_ID || "";
const when = (t) => new Date(t).toLocaleString("en-GB");
const strongMarks = name ? [`"customTitle":"${name}"`, `"agentName":"${name}"`, `"aiTitle":"${name}"`] : [];
const candidates = [];
for (const dir of fs.existsSync(base) ? fs.readdirSync(base) : []) {
  const d = path.join(base, dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith(".jsonl")) continue;
    const id = f.slice(0, -6);
    if (id === me) continue; // never itself
    if (wantedId && id !== wantedId) continue;
    const file = path.join(d, f);
    const text = fs.readFileSync(file, "utf8");
    // Strong match: the session IS called that; weak: it only mentions the name.
    const strong = !name || strongMarks.some((t) => text.includes(t));
    if (!strong && !text.includes(`"${name}"`)) continue;
    const cwd = (text.match(/"cwd":"((?:[^"\\]|\\.)*)"/) || [])[1];
    if (!cwd) continue;
    candidates.push({ id, cwd: JSON.parse(`"${cwd}"`), time: fs.statSync(file).mtimeMs, strong });
  }
}
const strong = candidates.filter((c) => c.strong).sort((a, b) => b.time - a.time);
if (!strong.length) {
  if (!candidates.length) {
    console.error(`Cannot find that session in ${base}.`);
    if (name) console.error(`If it has no /rename, its ListAgents name is not saved in the conversation: give it one with "/rename ${name}" next time, or use --id.`);
    process.exit(2);
  }
  console.error(`No session is named "${name}". These conversations only mention it; open the right one with --id:`);
  for (const c of candidates.sort((a, b) => b.time - a.time).slice(0, 10)) console.error(`  --id ${c.id}   ${when(c.time)}   ${c.cwd}`);
  process.exit(3);
}
const s = strong[0];
const title = name || s.id.slice(0, 8);
console.log(`Session ${title}: ${s.id}\nFolder: ${s.cwd}\nLast activity: ${when(s.time)}`);
if (strong.length > 1) console.log(`(${strong.length} conversations are named that: opening the most recent. Others: ${strong.slice(1, 4).map((c) => c.id).join(", ")})`);
if (dryRun) process.exit(0);

// Clean environment: drop everything that marks the new session as a child of this one.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDE/i.test(k)));
const command = `claude --resume ${s.id}`; // the id is a UUID: safe in any shell

if (process.platform === "win32") {
  spawn("cmd.exe", ["/c", "start", `"${title.replace(/"/g, "")}"`, "/D", `"${s.cwd}"`, "cmd", "/k", command],
    { env, detached: true, stdio: "ignore", windowsVerbatimArguments: true }).unref();
} else if (process.platform === "darwin") {
  // Terminal.app starts a fresh login shell (it does not inherit this process's CLAUDE_* variables).
  // The folder goes through AppleScript's `quoted form of`, so spaces, quotes, $ or \ are safe.
  const asString = (x) => `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const script = `tell application "Terminal" to do script "cd " & quoted form of ${asString(s.cwd)} & " && ${command}"`;
  spawn("osascript", ["-e", script, "-e", 'tell application "Terminal" to activate'], { env, detached: true, stdio: "ignore" }).unref();
} else {
  // The terminal starts in the session folder (cwd), so no path goes through the shell.
  spawn("x-terminal-emulator", ["-e", "bash", "-lc", command], { env, cwd: s.cwd, detached: true, stdio: "ignore" }).unref();
}
console.log("Opened in a new console. Inside it: /remote-control if needed, and \"wassup\" so it reads its mailbox.");
