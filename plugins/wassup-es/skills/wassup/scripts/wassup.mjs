#!/usr/bin/env node
// Wassup · helper for the mailbox between Claude Code sessions. Node 18+, no dependencies.
// © 2026 LV-Webstudio (Speccy81) · MIT
//
// The script numbers messages and works out what is unread; Claude writes the words.
// Each session only ever writes its own files (mailbox/<name>.md, STATUS-<name>.md): the golden rule.
//
//   node wassup.mjs init     --root <shared> --name <me> [--lang es|en] [--agent "<name in ListAgents>"]
//                            (the first init creates wassup.json and makes that session the coordinator)
//   node wassup.mjs register --root <shared> --by <coordinator> --name <new session>
//   node wassup.mjs send     --root <shared> --from <me> --to <a,b|all> --subject "…"
//                            (--body "…" | --body-file <file>) [--expect "…"] [--commit auto|<hash>]
//   node wassup.mjs unread   --root <shared> --me <me> [--json]
//   node wassup.mjs wait     --root <shared> --me <me> [--timeout <s>] [--interval <s>]
//   node wassup.mjs ack      --root <shared> --me <me> (--all | --from <other> --upto <n>)
//   node wassup.mjs status   --root <shared> [--json]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEXT = {
  es: {
    dir: 'buzon', status: 'ESTADO', proposals: 'desde', title: 'Buzón de', to: 'Para', subject: 'Asunto',
    expect: 'Espero de ti', all: 'todas', read: (o, n) => `Leído de ${o} hasta: #${n}`,
    owner: (n) => `Lo escribe solo la sesión ${n}. No lo edites a mano: usa \`wassup.mjs send\` y \`ack\`.`,
    statusHead: (n) => `# Estado de ${n}\nActualizado: — · Commit probado: —\n\n## Resultado\n| Prueba / tarea | Resultado | Detalle |\n|---|---|---|\n`,
    none: 'Nada sin leer.', unreadFrom: (o, k) => `${o}: ${k} sin leer`, expects: 'espera de ti',
    agent: 'Sesión de Claude Code', timeout: 'Nada nuevo en el tiempo de espera.',
  },
  en: {
    dir: 'mailbox', status: 'STATUS', proposals: 'from', title: 'Mailbox of', to: 'To', subject: 'Subject',
    expect: 'I expect from you', all: 'all', read: (o, n) => `Read from ${o} up to: #${n}`,
    owner: (n) => `Written only by session ${n}. Do not edit by hand: use \`wassup.mjs send\` and \`ack\`.`,
    statusHead: (n) => `# Status of ${n}\nUpdated: — · Commit tested: —\n\n## Result\n| Test / task | Result | Detail |\n|---|---|---|\n`,
    none: 'Nothing unread.', unreadFrom: (o, k) => `${o}: ${k} unread`, expects: 'expects from you',
    agent: 'Claude Code session', timeout: 'Nothing new within the timeout.',
  },
};
const ALL = new Set(['all', 'todas', 'todos', '*']);
const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export class WassupError extends Error {}

// ---------- files ----------
/** Write the whole file at once (temp file + rename): nobody ever reads half a message. */
function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

export function loadConfig(root) {
  const f = path.join(root, 'wassup.json');
  if (!fs.existsSync(f)) throw new WassupError(`No wassup.json in ${root}: run «init» first.`);
  const cfg = JSON.parse(read(f));
  return { ...cfg, t: TEXT[cfg.lang] ?? TEXT.en };
}
const mailboxFile = (root, cfg, name) => path.join(root, cfg.t.dir, `${name}.md`);

// ---------- parsing ----------
/** Messages of a mailbox: [{ n, date, commit, to: [..], subject, body, expect }]. */
export function parseMailbox(text) {
  const out = [];
  const re = /^## #(\d+) · ([^·\n]+?)(?: · commit (\S+))? · (?:Para|To): (.+)$/gm;
  const heads = [...text.matchAll(re)];
  heads.forEach((m, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length;
    const block = text.slice(m.index + m[0].length, end).replace(/\n---\s*$/, '').trim();
    const subject = (block.match(/^\*\*(?:Asunto|Subject):\*\* (.+)$/m) ?? [])[1] ?? '';
    const expect = (block.match(/^\*\*(?:Espero de ti|I expect from you):\*\* (.+)$/m) ?? [])[1] ?? '';
    out.push({
      n: Number(m[1]),
      date: m[2].trim(),
      commit: m[3] ?? null,
      to: m[4].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      subject,
      expect,
      body: block,
    });
  });
  return out;
}

/** «Read from X up to: #N» of a mailbox (accepts Spanish and English): { x: N }. */
export function parseAcks(text) {
  const acks = {};
  for (const m of text.matchAll(/(?:Leído de|Read from) ([a-z0-9_-]+) (?:hasta|up to): #(\d+)/g)) {
    acks[m[1]] = Number(m[2]);
  }
  return acks;
}

function renderAckLine(cfg, acks) {
  const parts = Object.keys(acks)
    .sort()
    .map((o) => cfg.t.read(o, acks[o]));
  return parts.length ? parts.join(' · ') : cfg.t.read('—', 0);
}

function setAcks(text, cfg, acks) {
  const line = renderAckLine(cfg, acks);
  const re = /^(?:(?:Leído de|Read from) .+)$/m;
  return re.test(text) ? text.replace(re, line) : text.replace(/\n---\n/, `\n${line}\n\n---\n`);
}

// ---------- commands ----------
/**
 * Prepares MY files. The first init creates wassup.json and that session becomes the coordinator: from then
 * on only the coordinator adds sessions (`register`), so wassup.json keeps a single writer.
 */
export function init({ root, name, lang = 'es', agent }) {
  if (!NAME.test(name ?? '')) throw new WassupError('--name: lowercase letters, digits, - or _ (max 32).');
  if (!TEXT[lang]) throw new WassupError('--lang: es or en.');
  fs.mkdirSync(root, { recursive: true });
  const cfgFile = path.join(root, 'wassup.json');
  let cfg;
  if (!fs.existsSync(cfgFile)) {
    cfg = { version: 2, lang, coordinator: name, sessions: [name] };
    writeAtomic(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
  } else {
    cfg = JSON.parse(read(cfgFile));
    if (!cfg.sessions.includes(name)) {
      throw new WassupError(
        `«${name}» is not registered. Ask the coordinator (${cfg.coordinator ?? cfg.sessions[0]}) to run: register --name ${name}`,
      );
    }
  }
  const t = TEXT[cfg.lang] ?? TEXT.en;
  fs.mkdirSync(path.join(root, t.dir), { recursive: true });
  fs.mkdirSync(path.join(root, `${t.proposals}-${name}`), { recursive: true });
  const mb = path.join(root, t.dir, `${name}.md`);
  if (!fs.existsSync(mb)) {
    writeAtomic(mb, `# ${t.title} ${name}\n${t.owner(name)}\n\n${t.read('—', 0)}\n\n---\n`);
  }
  if (agent) setAgent(mb, t, String(agent));
  const st = path.join(root, `${t.status}-${name}.md`);
  if (!fs.existsSync(st)) writeAtomic(st, t.statusHead(name));
  return { root, name, lang: cfg.lang, coordinator: cfg.coordinator ?? cfg.sessions[0], sessions: cfg.sessions };
}

/** The coordinator adds a session to wassup.json (the only writer of that file). */
export function register({ root, by, name }) {
  const cfgFile = path.join(root, 'wassup.json');
  const cfg = loadConfig(root);
  const coordinator = cfg.coordinator ?? cfg.sessions[0];
  if (by !== coordinator) throw new WassupError(`Only the coordinator (${coordinator}) registers sessions.`);
  if (!NAME.test(name ?? '')) throw new WassupError('--name: lowercase letters, digits, - or _ (max 32).');
  const { t: _t, ...plain } = cfg;
  if (!plain.sessions.includes(name)) {
    plain.sessions.push(name);
    writeAtomic(cfgFile, JSON.stringify(plain, null, 2) + '\n');
  }
  return plain.sessions;
}

/** «Claude Code session: <name in ListAgents>» in MY mailbox: how the others find me for direct notices. */
function setAgent(file, t, agent) {
  const text = read(file);
  const line = `${t.agent}: ${agent}`;
  const re = /^(?:Sesión de Claude Code|Claude Code session): .*$/m;
  const next = re.test(text) ? text.replace(re, line) : text.replace(/^(# .+\n.+\n)/, `$1${line}\n`);
  writeAtomic(file, next);
}

export function agentOf(text) {
  return (text.match(/^(?:Sesión de Claude Code|Claude Code session): (.+)$/m) ?? [])[1]?.trim() ?? null;
}

function gitShortHead(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function stamp(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function send({ root, from, to, subject, body, expect, commit, now }) {
  const cfg = loadConfig(root);
  const t = cfg.t;
  if (!cfg.sessions.includes(from)) throw new WassupError(`--from: «${from}» is not a session (run «init»).`);
  if (!subject?.trim()) throw new WassupError('--subject is required.');
  if (!body?.trim()) throw new WassupError('--body or --body-file is required.');
  const targets = String(to ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!targets.length) throw new WassupError('--to is required (a session, several separated by commas, or all).');
  for (const x of targets) {
    if (!ALL.has(x) && !cfg.sessions.includes(x)) throw new WassupError(`--to: «${x}» is not a session.`);
    if (x === from) throw new WassupError('--to: a session does not write to itself.');
  }
  const file = mailboxFile(root, cfg, from);
  const text = read(file);
  const n = Math.max(0, ...parseMailbox(text).map((m) => m.n)) + 1;
  // Commit only when asked: `auto` (git rev-parse in the current folder) or an explicit hash.
  const hash = !commit || commit === 'none' ? null : commit === 'auto' ? gitShortHead() : String(commit);
  const toLabel = targets.map((x) => (ALL.has(x) ? t.all : x)).join(', ');
  const head = `## #${n} · ${stamp(now)}${hash ? ` · commit ${hash}` : ''} · ${t.to}: ${toLabel}`;
  const msg =
    `\n${head}\n**${t.subject}:** ${subject.trim()}\n\n${body.trim()}\n` +
    (expect?.trim() ? `\n**${t.expect}:** ${expect.trim()}\n` : '') +
    '\n---\n';
  writeAtomic(file, text.replace(/\s*$/, '\n') + msg);
  return { n, file };
}

/** Unread messages addressed to «me» (or to all), per sender, after my «Read up to». */
export function unread({ root, me }) {
  const cfg = loadConfig(root);
  const mine = read(mailboxFile(root, cfg, me));
  const acks = parseAcks(mine);
  const result = [];
  for (const other of cfg.sessions) {
    if (other === me) continue;
    const f = mailboxFile(root, cfg, other);
    if (!fs.existsSync(f)) continue;
    const upto = acks[other] ?? 0;
    const msgs = parseMailbox(read(f)).filter(
      (m) => m.n > upto && m.to.some((x) => x === me || ALL.has(x)),
    );
    if (msgs.length) result.push({ from: other, upto, messages: msgs });
  }
  return result;
}

/** Waits until there is something unread for «me» (polling the files). Resolves with it, or [] on timeout. */
export async function wait({ root, me, timeout = 600, interval = 5 }) {
  const until = Date.now() + Number(timeout) * 1000;
  for (;;) {
    const u = unread({ root, me });
    if (u.length) return u;
    if (Date.now() >= until) return [];
    await new Promise((r) => setTimeout(r, Math.max(1, Number(interval)) * 1000));
  }
}

/** Marks as read, in MY mailbox only. --all: up to the last message of every other session. */
export function ack({ root, me, from, upto, all }) {
  const cfg = loadConfig(root);
  const file = mailboxFile(root, cfg, me);
  const text = read(file);
  const acks = parseAcks(text);
  delete acks['—'];
  if (all) {
    for (const other of cfg.sessions) {
      if (other === me) continue;
      const f = mailboxFile(root, cfg, other);
      if (!fs.existsSync(f)) continue;
      const last = Math.max(0, ...parseMailbox(read(f)).map((m) => m.n));
      if (last) acks[other] = Math.max(acks[other] ?? 0, last);
    }
  } else {
    if (!cfg.sessions.includes(from)) throw new WassupError(`--from: «${from}» is not a session.`);
    const n = Number(upto);
    if (!Number.isInteger(n) || n < 0) throw new WassupError('--upto: a message number.');
    acks[from] = n;
  }
  writeAtomic(file, setAcks(text, cfg, acks));
  return acks;
}

/** Every session: last message number and what it has not read from the others. */
export function status({ root }) {
  const cfg = loadConfig(root);
  return cfg.sessions.map((s) => {
    const f = mailboxFile(root, cfg, s);
    const text = fs.existsSync(f) ? read(f) : '';
    const msgs = parseMailbox(text);
    return {
      session: s,
      agent: text ? agentOf(text) : null,
      coordinator: s === (cfg.coordinator ?? cfg.sessions[0]),
      lastMessage: msgs.length ? msgs[msgs.length - 1].n : 0,
      lastDate: msgs.length ? msgs[msgs.length - 1].date : null,
      unread: text ? unread({ root, me: s }).reduce((k, u) => k + u.messages.length, 0) : 0,
    };
  });
}

// ---------- command line ----------
function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[k] = v;
    } else out._.push(a);
  }
  return out;
}

const HELP = `wassup.mjs — mailbox helper for Wassup (one writer per file)
  init     --root <shared> --name <me> [--lang es|en] [--agent "<name in ListAgents>"]
  register --root <shared> --by <coordinator> --name <new session>
  send     --root <shared> --from <me> --to <a,b|all> --subject "…" (--body "…"|--body-file f) [--expect "…"] [--commit auto|<hash>]
  unread   --root <shared> --me <me> [--json]
  wait     --root <shared> --me <me> [--timeout <s>] [--interval <s>]
  ack      --root <shared> --me <me> (--all | --from <other> --upto <n>)
  status   --root <shared> [--json]
«Read from X up to: #N» means «reviewed up to #N», including messages that were not addressed to you.`;

async function main(argv) {
  const a = args(argv);
  const cmd = a._[0];
  const root = a.root ? path.resolve(String(a.root)) : null;
  if (!cmd || cmd === 'help' || a.help) return console.log(HELP);
  if (!root) throw new WassupError('--root <shared folder> is required.');
  switch (cmd) {
    case 'init': {
      const r = init({ root, name: a.name, lang: a.lang, agent: a.agent });
      return console.log(`ok · ${r.name} · coordinator: ${r.coordinator} · sessions: ${r.sessions.join(', ')}`);
    }
    case 'register': {
      const r = register({ root, by: a.by, name: a.name });
      return console.log(`ok · sessions: ${r.join(', ')}`);
    }
    case 'wait': {
      const cfg = loadConfig(root);
      const r = await wait({ root, me: a.me, timeout: a.timeout ?? 600, interval: a.interval ?? 5 });
      if (!r.length) {
        console.log(cfg.t.timeout);
        process.exitCode = 2;
        return;
      }
      for (const u of r) console.log(`${cfg.t.unreadFrom(u.from, u.messages.length)}: ${u.messages.map((m) => `#${m.n} ${m.subject}`).join(' · ')}`);
      return;
    }
    case 'send': {
      const body = a['body-file'] ? fs.readFileSync(String(a['body-file']), 'utf8') : a.body;
      const r = send({ root, from: a.from, to: a.to, subject: a.subject, body, expect: a.expect, commit: a.commit });
      return console.log(`ok · #${r.n} · ${r.file}`);
    }
    case 'unread': {
      const cfg = loadConfig(root);
      const r = unread({ root, me: a.me });
      if (a.json) return console.log(JSON.stringify(r, null, 2));
      if (!r.length) return console.log(cfg.t.none);
      for (const u of r) {
        console.log(`\n== ${cfg.t.unreadFrom(u.from, u.messages.length)}`);
        for (const m of u.messages) {
          console.log(`#${m.n} · ${m.date}${m.commit ? ` · ${m.commit}` : ''} · ${m.subject}`);
          if (m.expect) console.log(`   ${cfg.t.expects}: ${m.expect}`);
        }
      }
      return;
    }
    case 'ack': {
      const r = ack({ root, me: a.me, from: a.from, upto: a.upto, all: !!a.all });
      return console.log(`ok · ${Object.entries(r).map(([k, v]) => `${k} #${v}`).join(' · ')}`);
    }
    case 'status': {
      const r = status({ root });
      if (a.json) return console.log(JSON.stringify(r, null, 2));
      for (const s of r)
        console.log(
          `${s.session.padEnd(12)}${s.coordinator ? '*' : ' '} last #${s.lastMessage} ${s.lastDate ?? ''} · unread ${s.unread}${s.agent ? ` · ${s.agent}` : ''}`,
        );
      return;
    }
    default:
      throw new WassupError(`Unknown command «${cmd}».\n${HELP}`);
  }
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof WassupError ? `wassup: ${e.message}` : e);
    process.exit(1);
  });
}
