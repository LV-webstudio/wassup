#!/usr/bin/env node
// Wassup · helper for the mailbox between Claude Code sessions. Node 18+, no dependencies.
// © 2026 LV-Webstudio (Speccy81) · MIT
//
// The script numbers messages and works out what is unread; Claude writes the words.
// Each session only ever writes its own files (mailbox/<name>.md, STATUS-<name>.md): the golden rule.
//
//   node wassup.mjs init     --root <shared> --name <me> [--lang es|en] [--agent "<name in ListAgents>[ | <name on another machine>]"]
//                            (the first init creates wassup.json and makes that session the coordinator)
//   node wassup.mjs register --root <shared> --by <coordinator> --name <new session>
//   node wassup.mjs send     --root <shared> --from <me> --to <a,b|all> --subject "…"
//                            (--body "…" | --body-file <file>) [--expect "…"] [--commit auto|<hash>]
//   node wassup.mjs unread   --root <shared> --me <me> [--json]
//   node wassup.mjs wait     --root <shared> --me <me> [--timeout <s>] [--interval <s>]
//   node wassup.mjs ack      --root <shared> --me <me> (--all | --from <other> --upto <n>)
//   node wassup.mjs status   --root <shared> [--json]
//   node wassup.mjs remind   --root <shared> --me <me> [--json] [--mark <to>#<n> --level <k> | --close-all]
//   node wassup.mjs config   --root <shared> --by <coordinator> [--mode escalate|auto] [--base <min>] [--max <min>]
//   node wassup.mjs health   --root <shared> --me <me> [--busy "<heavy job>" [--needs a,b]] [--json] [--quiet] [--watch <s>]
//   node wassup.mjs log      --root <shared> --me <me> --tipo <type> --texto "…" [--cc <Claude Code version>]
//   node wassup.mjs report   --root <shared> [--desde YYYY-MM-DD] [--retro] [--issue]
import crypto from 'node:crypto';
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
    reply: 'En respuesta a', noReminders: 'Nada que recordar.', caps: 'Capacidades', health: 'salud', incidents: 'incidencias', report: 'reporte',
    free: (r) => `${r.to} · libre ${r.freeMin} min y con recursos${r.ramGB != null ? ` (RAM ${String(r.ramGB).replace('.', ',')} GB)` : ''} → asígnale algo o confirma que espere${r.agent ? ` (${r.agent})` : ''}`,
    imbalance: (r) => `desequilibrio: ${r.from} SATURADO con «${r.job}» → ${r.to} libre${r.ramGB != null ? `, ${String(r.ramGB).replace('.', ',')} GB` : ''}: propón moverlo${r.agent ? ` (${r.agent})` : ''}`,
    noAssist: (l) => `Nadie necesita ayuda ahora (tu carga: ${l}).`,
    assistOffer: (o) => `${o.to} · carga ${o.load} → ofrécele ayuda${o.agent ? ` (${o.agent})` : ''}`,
    reminder: (r) => `${r.to} · #${r.n} ${r.subject} · esperando ${r.waitedMin} min (carga ${r.load}, umbral ${r.thresholdMin} min) · aviso ${r.level} → ${r.action === 'user' ? 'avisa a la persona' : 'recordatorio directo'}${r.agent ? ` (${r.agent})` : ''}`,
  },
  en: {
    dir: 'mailbox', status: 'STATUS', proposals: 'from', title: 'Mailbox of', to: 'To', subject: 'Subject',
    expect: 'I expect from you', all: 'all', read: (o, n) => `Read from ${o} up to: #${n}`,
    owner: (n) => `Written only by session ${n}. Do not edit by hand: use \`wassup.mjs send\` and \`ack\`.`,
    statusHead: (n) => `# Status of ${n}\nUpdated: — · Commit tested: —\n\n## Result\n| Test / task | Result | Detail |\n|---|---|---|\n`,
    none: 'Nothing unread.', unreadFrom: (o, k) => `${o}: ${k} unread`, expects: 'expects from you',
    agent: 'Claude Code session', timeout: 'Nothing new within the timeout.',
    reply: 'In reply to', noReminders: 'Nothing to remind.', caps: 'Capabilities', health: 'health', incidents: 'incidents', report: 'report',
    free: (r) => `${r.to} · free for ${r.freeMin} min with resources${r.ramGB != null ? ` (RAM ${r.ramGB} GB)` : ''} → give it something or confirm it should wait${r.agent ? ` (${r.agent})` : ''}`,
    imbalance: (r) => `imbalance: ${r.from} SATURATED with «${r.job}» → ${r.to} is free${r.ramGB != null ? `, ${r.ramGB} GB` : ''}: suggest moving it${r.agent ? ` (${r.agent})` : ''}`,
    noAssist: (l) => `Nobody needs help right now (your load: ${l}).`,
    assistOffer: (o) => `${o.to} · load ${o.load} → offer help${o.agent ? ` (${o.agent})` : ''}`,
    reminder: (r) => `${r.to} · #${r.n} ${r.subject} · waiting ${r.waitedMin} min (load ${r.load}, threshold ${r.thresholdMin} min) · notice ${r.level} → ${r.action === 'user' ? 'tell the person' : 'direct reminder'}${r.agent ? ` (${r.agent})` : ''}`,
  },
};
const ALL = new Set(['all', 'todas', 'todos', '*']);
const NOTHING = /^\s*(?:nada|ninguna?|nothing|none|n\/a|—|-)(?=[\s.,;:]|$)/i;
const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const VERSION = '0.9.0';

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
    const rawExpect = (block.match(/^\*\*(?:Espero de ti|I expect from you):\*\* (.+)$/m) ?? [])[1] ?? '';
    // «Espero de ti: nada» is not a request (no answer is needed, reading is enough).
    const expect = NOTHING.test(rawExpect) ? '' : rawExpect;
    out.push({
      re: replyNumbers(block),
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

/**
 * Numbers a message answers: its «**In reply to:** #4, #6» line (written by `send --re`) and, for messages
 * written by hand, a line that starts with «re …» («re crmweb#4, #5 y #6»). They are numbers of the
 * recipient's mailbox.
 */
export function replyNumbers(block) {
  const nums = new Set();
  for (const line of block.split('\n')) {
    if (/^\*\*(?:En respuesta a|In reply to):\*\*/.test(line) || /^\s*re\s/i.test(line))
      for (const m of line.matchAll(/#(\d+)/g)) nums.add(Number(m[1]));
  }
  return [...nums];
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
export function init({ root, name, lang = 'es', agent, caps }) {
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
  if (caps !== undefined && caps !== true) setCaps(mb, t, String(caps));
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

export function send({ root, from, to, subject, body, expect, commit, now, re }) {
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
  // --re 4,6: the message answers #4 and #6 of the recipient's mailbox (stops their reminders).
  const reNums = String(re ?? '')
    .split(',')
    .map((x) => Number(String(x).replace('#', '').trim()))
    .filter((x) => Number.isInteger(x) && x > 0);
  const reLine = reNums.length ? `**${t.reply}:** ${reNums.map((x) => `#${x}`).join(', ')}\n` : '';
  const msg =
    `\n${head}\n**${t.subject}:** ${subject.trim()}\n${reLine}\n${body.trim()}\n` +
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
    const h = loadHealth(root, cfg, s);
    return {
      session: s,
      agent: text ? agentOf(text) : null,
      caps: text ? capsOf(text) : [],
      health: h
        ? {
            estado: h.estado,
            ts: h.ts,
            ramGB: h.ram?.disponibleGB ?? null,
            compartidaGB: h.disco?.compartidaLibreGB ?? null,
            libreDesde: h.trabajo?.libre ? h.trabajo.desde : null,
            pesadoEnCurso: h.trabajo?.pesadoEnCurso ?? null,
            equipo: h.equipo?.id ?? null,
          }
        : null,
      coordinator: s === (cfg.coordinator ?? cfg.sessions[0]),
      lastMessage: msgs.length ? msgs[msgs.length - 1].n : 0,
      lastDate: msgs.length ? msgs[msgs.length - 1].date : null,
      unread: text ? unread({ root, me: s }).reduce((k, u) => k + u.messages.length, 0) : 0,
    };
  });
}

// ---------- reminders ----------
/**
 * Reminders by waiting time and workload. A message of mine is pending for a recipient until:
 *  - with «I expect from you»: that recipient ANSWERS it (a later message to me that lists its number in
 *    «In reply to» or in a line starting with «re …»);
 *  - without it: that recipient has READ it («Read from me up to» ≥ its number).
 * The threshold grows with the recipient's load (their unread messages plus what others expect from them):
 * a busy session gets more patience, never beyond `maxMin`. Notices: 1 at the threshold, 2 at twice it,
 * 3 at four times it. In «escalate» mode the 3rd goes to the person; in «auto» mode every notice is a
 * direct reminder and the person is never bothered.
 */
export const REMIND_DEFAULTS = { mode: 'escalate', baseMin: 60, maxMin: 480 };
const LOAD_STEP = 5; // each 5 items of load add one more «base» of patience

/** «2026-09-29 07:23» (send) or «29/09/2026 06:25» (written by hand), local time. */
export function parseStamp(s) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s ?? '');
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5]);
  const es = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s ?? '');
  if (es) return new Date(+es[3], +es[2] - 1, +es[1], +(es[4] ?? 0), +(es[5] ?? 0));
  return null;
}

function remindConfig(cfg) {
  const r = { ...REMIND_DEFAULTS, ...(cfg.reminders ?? {}) };
  return { mode: r.mode === 'auto' ? 'auto' : 'escalate', baseMin: Number(r.baseMin) || 60, maxMin: Number(r.maxMin) || 480 };
}

const remindFile = (root, me) => path.join(root, `reminders-${me}.json`);
function loadReminded(root, me) {
  const f = remindFile(root, me);
  return fs.existsSync(f) ? JSON.parse(read(f)) : {};
}

/** Everything each session has sent, keyed by sender. */
function allMailboxes(root, cfg) {
  const out = {};
  for (const s of cfg.sessions) {
    const f = mailboxFile(root, cfg, s);
    const text = fs.existsSync(f) ? read(f) : '';
    out[s] = { messages: parseMailbox(text), acks: parseAcks(text) };
  }
  return out;
}

const addressedTo = (m, x) => m.to.some((y) => y === x || ALL.has(y));

/** Is message `m` from `sender` still pending for `recipient`? */
function isPending(boxes, sender, m, recipient) {
  // No date check: hand-written stamps are approximate and a reply can look «earlier» than the question.
  // Quoting the exact number is proof enough.
  if (m.expect)
    return !boxes[recipient].messages.some((r) => addressedTo(r, sender) && r.re.includes(m.n));
  return (boxes[recipient].acks[sender] ?? 0) < m.n;
}

/** Load of a session: its unread messages plus the answers others expect from it. */
export function loadOf(boxes, sessions, x) {
  let load = 0;
  for (const s of sessions) {
    if (s === x) continue;
    const upto = boxes[x].acks[s] ?? 0;
    for (const m of boxes[s].messages) {
      if (!addressedTo(m, x)) continue;
      if (m.n > upto) load++;
      else if (m.expect && isPending(boxes, s, m, x)) load++;
    }
  }
  return load;
}

/** Reminders that are due now for messages sent by «me» (only notices not given yet). */
export function remind({ root, me, now = new Date() }) {
  const cfg = loadConfig(root);
  if (!cfg.sessions.includes(me)) throw new WassupError(`--me: «${me}» is not a session.`);
  const rc = remindConfig(cfg);
  const boxes = allMailboxes(root, cfg);
  const given = loadReminded(root, me);
  const out = [];
  for (const m of boxes[me].messages) {
    const recipients = m.to.some((y) => ALL.has(y)) ? cfg.sessions.filter((s) => s !== me) : m.to;
    for (const x of recipients) {
      if (!boxes[x] || !isPending(boxes, me, m, x)) continue;
      const sent = parseStamp(m.date);
      if (!sent) continue;
      const waitedMin = Math.floor((now.getTime() - sent.getTime()) / 60000);
      const load = loadOf(boxes, cfg.sessions, x);
      // A saturated session (M22) gets twice the patience: no reminders while it is drowning.
      const saturated = loadHealth(root, cfg, x)?.estado === 'saturado';
      const thresholdMin = Math.min(rc.maxMin, Math.round(rc.baseMin * (1 + load / LOAD_STEP))) * (saturated ? 2 : 1);
      const level = waitedMin >= thresholdMin * 4 ? 3 : waitedMin >= thresholdMin * 2 ? 2 : waitedMin >= thresholdMin ? 1 : 0;
      if (level === 0 || level <= (given[`${x}#${m.n}`] ?? 0)) continue;
      const f = mailboxFile(root, cfg, x);
      out.push({
        to: x,
        agent: fs.existsSync(f) ? agentOf(read(f)) : null,
        n: m.n,
        subject: m.subject,
        expect: m.expect,
        needs: m.expect ? 'answer' : 'read',
        waitedMin,
        load,
        thresholdMin,
        level,
        action: level === 3 && rc.mode === 'escalate' ? 'user' : 'direct',
      });
    }
  }
  out.sort((a, b) => b.level - a.level || b.waitedMin - a.waitedMin);
  if (me === (cfg.coordinator ?? cfg.sessions[0])) out.push(...resourceReminders({ root, cfg, me, now, given }));
  return out;
}

/**
 * Notes that notice `level` for `<to>#<n>` was given (in reminders-<me>.json: only I write it). Entries
 * that are no longer pending are dropped, so the file never grows.
 */
export function markReminded({ root, me, key, level }) {
  const cfg = loadConfig(root);
  // Resource reminders (M22) are noted by their key («libre:<x>@<since>», «deseq:<x>@<ts>»), once.
  if (/^(?:libre|deseq):[a-z0-9_-]+@/.test(String(key ?? ''))) {
    const given = loadReminded(root, me);
    given[String(key)] = 1;
    const now = Date.now();
    for (const k of Object.keys(given)) {
      const at = /^(?:libre|deseq):[^@]+@(.+)$/.exec(k)?.[1];
      if (at && now - new Date(at).getTime() > 7 * 24 * 3600 * 1000) delete given[k];
    }
    writeAtomic(remindFile(root, me), JSON.stringify(given, null, 2) + '\n');
    return given;
  }
  const [to, n] = String(key ?? '').split('#');
  if (!cfg.sessions.includes(to) || !Number.isInteger(Number(n))) throw new WassupError('--mark: <session>#<number>.');
  const k = Number(level);
  if (![1, 2, 3].includes(k)) throw new WassupError('--level: 1, 2 or 3.');
  const boxes = allMailboxes(root, cfg);
  const given = loadReminded(root, me);
  given[`${to}#${Number(n)}`] = Math.max(given[`${to}#${Number(n)}`] ?? 0, k);
  for (const key2 of Object.keys(given)) {
    if (key2.includes(':')) continue;
    const [x, num] = key2.split('#');
    const m = boxes[me].messages.find((mm) => mm.n === Number(num));
    if (!m || !boxes[x] || !isPending(boxes, me, m, x)) delete given[key2];
  }
  writeAtomic(remindFile(root, me), JSON.stringify(given, null, 2) + '\n');
  return given;
}

/**
 * Migration to reminders: closes (notice 3 given) everything pending right now, due or not. For mailboxes
 * written before 0.7, where answers did not quote the number. Only writes reminders-<me>.json.
 */
export function closeAll({ root, me }) {
  const cfg = loadConfig(root);
  if (!cfg.sessions.includes(me)) throw new WassupError(`--me: «${me}» is not a session.`);
  const boxes = allMailboxes(root, cfg);
  const given = loadReminded(root, me);
  let closed = 0;
  for (const m of boxes[me].messages) {
    const recipients = m.to.some((y) => ALL.has(y)) ? cfg.sessions.filter((s) => s !== me) : m.to;
    for (const x of recipients) {
      if (!boxes[x] || !isPending(boxes, me, m, x) || given[`${x}#${m.n}`] === 3) continue;
      given[`${x}#${m.n}`] = 3;
      closed++;
    }
  }
  writeAtomic(remindFile(root, me), JSON.stringify(given, null, 2) + '\n');
  return closed;
}

/** The coordinator (only writer of wassup.json) sets the reminder mode and times. */
export function configure({ root, by, mode, base, max, assistMin, assistOwn, assistCooldown, recursos = {}, incidents }) {
  const cfgFile = path.join(root, 'wassup.json');
  const cfg = loadConfig(root);
  const coordinator = cfg.coordinator ?? cfg.sessions[0];
  if (by !== coordinator) throw new WassupError(`Only the coordinator (${coordinator}) changes wassup.json.`);
  const { t: _t, ...plain } = cfg;
  const r = { ...remindConfig(cfg) };
  if (mode !== undefined) {
    if (!['escalate', 'auto'].includes(mode)) throw new WassupError('--mode: escalate or auto.');
    r.mode = mode;
  }
  for (const [k, v] of [['baseMin', base], ['maxMin', max]]) {
    if (v === undefined) continue;
    const x = Number(v);
    if (!Number.isInteger(x) || x < 1) throw new WassupError(`--${k === 'baseMin' ? 'base' : 'max'}: whole minutes.`);
    r[k] = x;
  }
  if (r.maxMin < r.baseMin) throw new WassupError('--max cannot be lower than --base.');
  plain.reminders = r;
  const ac = { ...assistConfig(cfg) };
  for (const [k, v, flag] of [
    ['minLoad', assistMin, 'assist-min'],
    ['ownMax', assistOwn, 'assist-own'],
    ['cooldownMin', assistCooldown, 'assist-cooldown'],
  ]) {
    if (v === undefined) continue;
    const x = Number(v);
    if (!Number.isInteger(x) || x < 0) throw new WassupError(`--${flag}: a whole number.`);
    ac[k] = x;
  }
  plain.assist = ac;
  const rs = { ...resourcesConfig(cfg) };
  for (const [k, v] of Object.entries(recursos)) {
    if (v === undefined) continue;
    const x = Number(v);
    if (!(k in RESOURCES_DEFAULTS) || !Number.isFinite(x) || x < 0) throw new WassupError(`recursos.${k}: a number ≥ 0.`);
    rs[k] = x;
  }
  plain.recursos = rs;
  if (incidents !== undefined) {
    if (!['on', 'off', true, false].includes(incidents)) throw new WassupError('--incidents: on or off.');
    plain.incidencias = incidents === 'on' || incidents === true;
  }
  writeAtomic(cfgFile, JSON.stringify(plain, null, 2) + '\n');
  return { ...r, assist: ac, recursos: rs, incidencias: plain.incidencias === true };
}

// ---------- offers of help (by workload) ----------
/**
 * When I am nearly free and another session is overloaded, I offer to take work off it. Load is the same
 * as for reminders (unread + answers expected from it). `minLoad`: from how much load a session counts as
 * overloaded; `ownMax`: the most load I can have to offer; `cooldownMin`: minutes before offering the
 * same session again. The overloaded one decides what to hand over, and which FILES change owner (the
 * golden rule stays: one writer per file).
 */
export const ASSIST_DEFAULTS = { minLoad: 6, ownMax: 2, cooldownMin: 120 };

function assistConfig(cfg) {
  const a = { ...ASSIST_DEFAULTS, ...(cfg.assist ?? {}) };
  const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return { minLoad: n(a.minLoad, 6), ownMax: n(a.ownMax, 2), cooldownMin: n(a.cooldownMin, 120) };
}
const assistFile = (root, me) => path.join(root, `assist-${me}.json`);

/** Sessions I could help now: overloaded, not offered recently, and only if I am free enough. */
export function assist({ root, me, now = new Date() }) {
  const cfg = loadConfig(root);
  if (!cfg.sessions.includes(me)) throw new WassupError(`--me: «${me}» is not a session.`);
  const ac = assistConfig(cfg);
  const boxes = allMailboxes(root, cfg);
  const myLoad = loadOf(boxes, cfg.sessions, me);
  if (myLoad > ac.ownMax) return { myLoad, offers: [] };
  const f = assistFile(root, me);
  const last = fs.existsSync(f) ? JSON.parse(read(f)) : {};
  const offers = [];
  for (const x of cfg.sessions) {
    if (x === me) continue;
    const load = loadOf(boxes, cfg.sessions, x);
    if (load < ac.minLoad) continue;
    const prev = last[x] ? new Date(last[x]).getTime() : 0;
    if (now.getTime() - prev < ac.cooldownMin * 60000) continue;
    const mf = mailboxFile(root, cfg, x);
    offers.push({ to: x, agent: fs.existsSync(mf) ? agentOf(read(mf)) : null, load });
  }
  return { myLoad, offers: offers.sort((a, b) => b.load - a.load) };
}

/** Notes that I offered help to `to` now (assist-<me>.json: only I write it). */
export function markAssist({ root, me, to, now = new Date() }) {
  const cfg = loadConfig(root);
  if (!cfg.sessions.includes(to) || to === me) throw new WassupError('--mark: another session.');
  const f = assistFile(root, me);
  const last = fs.existsSync(f) ? JSON.parse(read(f)) : {};
  last[to] = now.toISOString();
  writeAtomic(f, JSON.stringify(last, null, 2) + '\n');
  return last;
}

// ---------- capabilities (M21) ----------
/**
 * «Capabilities: playwright, safari, cred:ferro-deploy, ram:16» in MY mailbox (one writer): what my machine
 * CAN do. Never secrets: «cred:x» says that I hold the credentials for x, not what they are.
 */
function setCaps(file, t, caps) {
  const text = read(file);
  const list = String(caps)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const line = `${t.caps}: ${list.join(', ')}`;
  const re = /^(?:Capacidades|Capabilities): .*$/m;
  const agentLine = /^((?:Sesión de Claude Code|Claude Code session): .*\n)/m;
  // Replace my line; if there is none, put it under the agent line (or under the header).
  const next = re.test(text)
    ? text.replace(re, line)
    : agentLine.test(text)
      ? text.replace(agentLine, `$1${line}\n`)
      : text.replace(/^(# .+\n.+\n)/, `$1${line}\n`);
  writeAtomic(file, next);
}

export function capsOf(text) {
  const raw = (text.match(/^(?:Capacidades|Capabilities): (.+)$/m) ?? [])[1];
  return raw ? raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
}

// ---------- resources (M22) ----------
/**
 * Each session measures its machine at checkpoints and writes health-<me>.json (salud-<yo>.json in Spanish;
 * only that session writes it, whole file each time). Aggregated numbers only: no process names, paths or
 * users. No sudo, no daemons, nothing installed; what cannot be read without permissions is «unknown».
 */
export const RESOURCES_DEFAULTS = {
  ramDisponibleMinGB: 1.0,
  ramJustoGB: 2.0,
  cargaMaxPorNucleo: 1.5,
  discoRepoMinGB: 5,
  discoCompartidaMinGB: 2,
  libreRecordarMin: 15,
};
export const HEALTH_CODE = { ok: 0, justo: 1, saturado: 2 };
const HEAVY_NEVER_MOVED = /despliegue|desplegar|deploy|producci[oó]n|production/i;

function resourcesConfig(cfg) {
  const r = { ...RESOURCES_DEFAULTS, ...(cfg.recursos ?? {}) };
  for (const k of Object.keys(RESOURCES_DEFAULTS)) r[k] = Number.isFinite(Number(r[k])) ? Number(r[k]) : RESOURCES_DEFAULTS[k];
  return r;
}
const healthFile = (root, cfg, me) => path.join(root, `${cfg.t.health}-${me}.json`);
export function loadHealth(root, cfg, me) {
  const f = healthFile(root, cfg, me);
  try {
    return fs.existsSync(f) ? JSON.parse(read(f)) : null;
  } catch {
    return null;
  }
}
const gb = (bytes) => Math.round((bytes / 1024 ** 3) * 10) / 10;

/** `vm_stat` (macOS): available = (free + inactive + speculative + purgeable) × page size. */
export function parseVmStat(text) {
  const page = Number((/page size of (\d+) bytes/.exec(text) ?? [])[1] ?? 4096);
  const pages = (name) => Number((new RegExp(`^Pages ${name}:\\s+(\\d+)`, 'm').exec(text) ?? [])[1] ?? 0);
  return gb((pages('free') + pages('inactive') + pages('speculative') + pages('purgeable')) * page);
}

/** `sysctl vm.swapusage` (macOS): used, in GB. */
export function parseSwapUsage(text) {
  const m = /used = ([\d.]+)([MG])/.exec(text ?? '');
  if (!m) return null;
  return Math.round((m[2] === 'G' ? Number(m[1]) : Number(m[1]) / 1024) * 10) / 10;
}

/** `pmset -g therm` (macOS): speed limit and warning level. */
export function parsePmsetTherm(text) {
  const limit = Number((/CPU_Speed_Limit\s*=\s*(\d+)/.exec(text ?? '') ?? [])[1] ?? NaN);
  const warning = /warning level\s*(?:=|:)?\s*[1-9]/i.test(text ?? '') && !/No thermal warning/i.test(text ?? '');
  if (!Number.isFinite(limit) && !warning) return { estado: 'desconocida', limiteVelocidadPct: null, fuente: 'pmset' };
  return {
    estado: warning ? 'aviso' : Number.isFinite(limit) && limit < 100 ? 'estrangulada' : 'normal',
    limiteVelocidadPct: Number.isFinite(limit) ? limit : null,
    fuente: 'pmset',
  };
}

function runner(cmd, argv, timeout = 5000) {
  return execFileSync(cmd, argv, { timeout, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString();
}

function diskFreeGB(dir) {
  try {
    const s = fs.statfsSync(dir);
    return gb(Number(s.bavail) * Number(s.bsize));
  } catch {
    return null;
  }
}

/** Load per core: loadavg where it exists; on Windows (loadavg is 0) a 1-second sample of os.cpus(). */
async function loadPerCore(platform, osm) {
  const cores = osm.cpus().length || 1;
  if (platform !== 'win32') return Math.round((osm.loadavg()[0] / cores) * 100) / 100;
  const snap = () => osm.cpus().map((c) => ({ idle: c.times.idle, total: Object.values(c.times).reduce((a, b) => a + b, 0) }));
  const a = snap();
  await new Promise((r) => setTimeout(r, 1000));
  const b = snap();
  let idle = 0;
  let total = 0;
  b.forEach((x, i) => {
    idle += x.idle - a[i].idle;
    total += x.total - a[i].total;
  });
  return total ? Math.round((1 - idle / total) * 100) / 100 : 0;
}

/**
 * Measures this machine. `run` and `osm` can be replaced in tests; `WASSUP_FAKE_*` variables override
 * single figures (RAM_GB, SWAP_GB, LOAD, DISK_REPO_GB, DISK_SHARED_GB, THERMAL) to rehearse the protocol.
 */
export async function measure({ root, repo = process.cwd(), platform = process.platform, run = runner, osm, env = process.env }) {
  osm = osm ?? (await import('node:os')).default;
  const s = {
    so: `${platform} ${osm.release()}`,
    nucleos: osm.cpus().length || 1,
    ramTotalGB: gb(osm.totalmem()),
    ramGB: null,
    swapGB: null,
    carga: 0,
    repoGB: diskFreeGB(repo),
    compartidaGB: diskFreeGB(root),
    termica: { estado: 'desconocida', limiteVelocidadPct: null, fuente: null },
    vmMemGB: null,
    equipoId: crypto.createHash('sha256').update(osm.hostname()).digest('hex').slice(0, 8),
  };
  const tryRun = (cmd, argv, timeout) => {
    try {
      return run(cmd, argv, timeout);
    } catch {
      return null;
    }
  };
  if (platform === 'darwin') {
    // os.freemem() is wrong on macOS (it leaves out inactive and purgeable memory): vm_stat.
    const vm = tryRun('vm_stat', []);
    s.ramGB = vm ? parseVmStat(vm) : gb(osm.freemem());
    s.swapGB = parseSwapUsage(tryRun('sysctl', ['vm.swapusage']));
    const th = tryRun('pmset', ['-g', 'therm']);
    if (th) s.termica = parsePmsetTherm(th);
  } else if (platform === 'linux') {
    let mem = null;
    try {
      mem = fs.readFileSync('/proc/meminfo', 'utf8');
    } catch {
      /* not available */
    }
    const kb = (k) => Number((new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(mem ?? '') ?? [])[1] ?? NaN);
    s.ramGB = Number.isFinite(kb('MemAvailable')) ? gb(kb('MemAvailable') * 1024) : gb(osm.freemem());
    if (Number.isFinite(kb('SwapTotal'))) s.swapGB = gb((kb('SwapTotal') - kb('SwapFree')) * 1024);
    try {
      const zones = fs.readdirSync('/sys/class/thermal').filter((z) => z.startsWith('thermal_zone'));
      const temps = zones.map((z) => Number(fs.readFileSync(`/sys/class/thermal/${z}/temp`, 'utf8')) / 1000).filter(Number.isFinite);
      if (temps.length) {
        const max = Math.max(...temps);
        s.termica = { estado: max >= 90 ? 'aviso' : 'normal', limiteVelocidadPct: null, fuente: 'sysfs', maxC: Math.round(max) };
      }
    } catch {
      /* unknown */
    }
  } else {
    // Windows: freemem is real available memory. Swap and temperature in one PowerShell call, best effort
    // (the thermal zone usually needs an administrator: then it stays «unknown»).
    s.ramGB = gb(osm.freemem());
    if (platform === 'win32') {
      const out = tryRun(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          "$s=(Get-CimInstance Win32_PageFileUsage | Measure-Object CurrentUsage -Sum).Sum; $t=$null; try { $t=(Get-CimInstance -Namespace root/wmi MSAcpi_ThermalZoneTemperature -ErrorAction Stop | Select-Object -First 1).CurrentTemperature } catch {}; \"$s;$t\"",
        ],
        8000,
      );
      const [sw, te] = String(out ?? '').trim().split(';');
      if (sw && Number.isFinite(Number(sw))) s.swapGB = Math.round((Number(sw) / 1024) * 10) / 10;
      if (te && Number.isFinite(Number(te)) && Number(te) > 0) {
        const c = Number(te) / 10 - 273.15;
        s.termica = { estado: c >= 90 ? 'aviso' : 'normal', limiteVelocidadPct: null, fuente: 'wmi', maxC: Math.round(c) };
      }
    }
  }
  s.carga = await loadPerCore(platform, osm);
  const docker = env.WASSUP_NO_DOCKER ? null : tryRun('docker', ['info', '--format', '{{.MemTotal}}'], 3000);
  if (docker && Number(docker.trim()) > 0) s.vmMemGB = gb(Number(docker.trim()));
  const fake = (k) => (env[`WASSUP_FAKE_${k}`] !== undefined ? env[`WASSUP_FAKE_${k}`] : undefined);
  if (fake('RAM_GB') !== undefined) s.ramGB = Number(fake('RAM_GB'));
  if (fake('SWAP_GB') !== undefined) s.swapGB = Number(fake('SWAP_GB'));
  if (fake('LOAD') !== undefined) s.carga = Number(fake('LOAD'));
  if (fake('DISK_REPO_GB') !== undefined) s.repoGB = Number(fake('DISK_REPO_GB'));
  if (fake('DISK_SHARED_GB') !== undefined) s.compartidaGB = Number(fake('DISK_SHARED_GB'));
  if (fake('THERMAL') !== undefined) s.termica = { estado: String(fake('THERMAL')), limiteVelocidadPct: null, fuente: 'fake' };
  return s;
}

const fmt = (n) => String(n).replace('.', ',');
/** Raw state of one sample and its reasons (before hysteresis). */
export function classify(s, rec, prev, lang = 'es') {
  const es = lang === 'es';
  let sat = false;
  let just = false;
  const why = [];
  if (s.ramGB != null && s.ramGB < rec.ramDisponibleMinGB) {
    sat = true;
    why.push(es ? `RAM disponible ${fmt(s.ramGB)} GB` : `available RAM ${s.ramGB} GB`);
  } else if (s.ramGB != null && s.ramGB < rec.ramJustoGB) {
    just = true;
    why.push(es ? `RAM disponible ${fmt(s.ramGB)} GB` : `available RAM ${s.ramGB} GB`);
  }
  const prevSwap = prev?.ram?.swapUsadoGB;
  if (s.swapGB != null && prevSwap != null && s.swapGB > prevSwap + 0.1 && s.ramGB != null && s.ramGB < rec.ramJustoGB) {
    sat = true;
    why.push(es ? 'swap creciendo' : 'swap growing');
  }
  if (s.carga > rec.cargaMaxPorNucleo) {
    sat = true;
    why.push(es ? `carga ${fmt(s.carga)} por núcleo` : `load ${s.carga} per core`);
  } else if (s.carga > 1) {
    just = true;
    why.push(es ? `carga ${fmt(s.carga)} por núcleo` : `load ${s.carga} per core`);
  }
  if (s.repoGB != null && s.repoGB < rec.discoRepoMinGB) {
    sat = true;
    why.push(es ? `disco del repo ${fmt(s.repoGB)} GB` : `repo disk ${s.repoGB} GB`);
  } else if (s.repoGB != null && s.repoGB < rec.discoRepoMinGB * 2) {
    just = true;
    why.push(es ? `disco del repo ${fmt(s.repoGB)} GB` : `repo disk ${s.repoGB} GB`);
  }
  if (s.compartidaGB != null && s.compartidaGB < rec.discoCompartidaMinGB) {
    sat = true;
    why.push(es ? `compartida ${fmt(s.compartidaGB)} GB` : `shared folder ${s.compartidaGB} GB`);
  }
  if (s.termica?.estado === 'aviso') {
    sat = true;
    why.push(es ? 'aviso térmico' : 'thermal warning');
  } else if (s.termica?.estado === 'estrangulada') {
    just = true;
    why.push(es ? `CPU limitada al ${s.termica.limiteVelocidadPct} %` : `CPU limited to ${s.termica.limiteVelocidadPct} %`);
  }
  return { estado: sat ? 'saturado' : just ? 'justo' : 'ok', motivos: why };
}

/** «free» in the last message I sent; a new request to me (with «I expect from you», unanswered) after it undoes it. */
function freeSince(boxes, sessions, me) {
  const mine = boxes[me].messages;
  const last = mine[mine.length - 1];
  if (!last || !/(^|[^\p{L}])(libre|free)([^\p{L}]|$)/iu.test(last.body)) return null;
  const since = parseStamp(last.date);
  if (!since) return null;
  for (const s of sessions) {
    if (s === me) continue;
    for (const m of boxes[s].messages) {
      const d = parseStamp(m.date);
      if (addressedTo(m, me) && m.expect && d && d > since && isPending(boxes, s, m, me)) return null;
    }
  }
  return since;
}

/**
 * `w health`: measure, apply hysteresis (a state changes only when the last two samples agree), write my
 * health file and, once per episode and per machine, tell the coordinator (`[resources] saturated` and,
 * when it recovers, `[resources] ok`). `sample` replaces the measurement (tests). Returns the file content
 * plus `code` (0 ok, 1 tight, 2 saturated) and `sent` (the message number, if one was sent).
 */
export async function health({ root, me, busy, needs, now = new Date(), sample, repo, send: doSend = true }) {
  const cfg = loadConfig(root);
  if (!cfg.sessions.includes(me)) throw new WassupError(`--me: «${me}» is not a session.`);
  const rec = resourcesConfig(cfg);
  const coordinator = cfg.coordinator ?? cfg.sessions[0];
  const prev = loadHealth(root, cfg, me);
  const s = sample ?? (await measure({ root, repo }));
  const raw = classify(s, rec, prev, cfg.lang);
  const historial = [...(prev?.historial ?? []), raw.estado].slice(-3);
  const n = historial.length;
  const estado = n >= 2 && historial[n - 1] === historial[n - 2] ? historial[n - 1] : prev?.estado ?? 'ok';
  const boxes = allMailboxes(root, cfg);
  const since = freeSince(boxes, cfg.sessions, me);
  const trabajo = {
    libre: !!since,
    desde: since ? since.toISOString() : null,
    pesadoEnCurso: busy === undefined ? prev?.trabajo?.pesadoEnCurso ?? null : String(busy).trim() || null,
    necesita:
      needs === undefined
        ? busy === undefined
          ? prev?.trabajo?.necesita ?? []
          : String(busy).trim()
            ? prev?.trabajo?.necesita ?? []
            : []
        : String(needs).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
  };
  // One notice per episode and per machine: a sibling session on the same machine that already warned
  // (less than 5 minutes ago) counts as mine.
  let aviso = prev?.aviso ?? { estado: null, ts: null, enviado: false };
  let sent = null;
  const es = cfg.lang === 'es';
  const siblingWarned = () =>
    cfg.sessions.some((x) => {
      if (x === me) return false;
      const h = loadHealth(root, cfg, x);
      return (
        h?.equipo?.id === s.equipoId &&
        h?.aviso?.estado === 'saturado' &&
        h.aviso.ts &&
        now.getTime() - new Date(h.aviso.ts).getTime() < 5 * 60000
      );
    });
  if (estado === 'saturado' && aviso.estado !== 'saturado') {
    const sibling = siblingWarned();
    aviso = { estado: 'saturado', ts: now.toISOString(), enviado: !sibling };
    if (!sibling && doSend && me !== coordinator) {
      const body = [
        (es ? 'Motivos: ' : 'Reasons: ') + (raw.motivos.join('; ') || '—'),
        trabajo.pesadoEnCurso ? (es ? 'Pesado en curso: ' : 'Heavy job running: ') + trabajo.pesadoEnCurso : '',
        es ? 'No lanzo nada pesado nuevo hasta volver a «ok».' : 'I launch nothing heavy until back to «ok».',
      ]
        .filter(Boolean)
        .join('\n');
      sent = send({
        root,
        from: me,
        to: coordinator,
        subject: `${es ? '[recursos] saturado' : '[resources] saturated'}: ${raw.motivos.join('; ') || '—'}`,
        body,
        expect: es ? 'reparto o espera' : 'reassign or wait',
        now,
      }).n;
    }
  } else if (estado === 'ok' && aviso.estado === 'saturado') {
    if (aviso.enviado && doSend && me !== coordinator) {
      sent = send({
        root,
        from: me,
        to: coordinator,
        subject: es ? '[recursos] ok' : '[resources] ok',
        body: es ? 'Vuelvo a tener recursos.' : 'Resources are back.',
        now,
      }).n;
    }
    aviso = { estado: null, ts: null, enviado: false };
  }
  const out = {
    v: 1,
    sesion: me,
    ts: now.toISOString(),
    equipo: { id: s.equipoId, so: s.so, nucleos: s.nucleos, ramTotalGB: s.ramTotalGB },
    ram: {
      disponibleGB: s.ramGB,
      pct: s.ramGB != null && s.ramTotalGB ? Math.round((s.ramGB / s.ramTotalGB) * 100) : null,
      swapUsadoGB: s.swapGB,
    },
    cpu: { cargaPorNucleo: s.carga },
    disco: { repoLibreGB: s.repoGB, compartidaLibreGB: s.compartidaGB },
    termica: s.termica,
    contenedores: { vmMemGB: s.vmMemGB },
    estado,
    // State of this sample alone: `estado` only follows it when two samples in a row agree (hysteresis).
    muestra: raw.estado,
    motivos: raw.motivos,
    trabajo,
    historial,
    aviso,
  };
  writeAtomic(healthFile(root, cfg, me), JSON.stringify(out, null, 2) + '\n');
  return { ...out, code: HEALTH_CODE[estado], sent };
}

/**
 * Coordinator-only resource reminders: a session «free and with resources» for more than `libreRecordarMin`,
 * and «imbalance» (a saturated session with a heavy job, and a free one in «ok» that has every capability
 * the job needs). Deploys and production work are never suggested to move (credentials, M21).
 */
function resourceReminders({ root, cfg, me, now, given }) {
  const rec = resourcesConfig(cfg);
  const out = [];
  const info = cfg.sessions.map((x) => {
    const f = mailboxFile(root, cfg, x);
    const text = fs.existsSync(f) ? read(f) : '';
    return { x, h: loadHealth(root, cfg, x), caps: capsOf(text), agent: text ? agentOf(text) : null };
  });
  const free = info.filter(
    (i) => i.x !== me && i.h?.estado === 'ok' && i.h?.trabajo?.libre && i.h.trabajo.desde,
  );
  for (const i of free) {
    const min = Math.floor((now.getTime() - new Date(i.h.trabajo.desde).getTime()) / 60000);
    const key = `libre:${i.x}@${i.h.trabajo.desde}`;
    if (min >= rec.libreRecordarMin && !given[key])
      out.push({ kind: 'libre', key, to: i.x, agent: i.agent, freeMin: min, ramGB: i.h.ram?.disponibleGB ?? null });
  }
  for (const s of info) {
    const job = s.h?.trabajo?.pesadoEnCurso;
    if (s.h?.estado !== 'saturado' || !job || HEAVY_NEVER_MOVED.test(job)) continue;
    const needs = s.h.trabajo.necesita ?? [];
    const to = free.find((i) => i.x !== s.x && needs.every((n) => i.caps.includes(n)));
    const key = `deseq:${s.x}@${s.h.aviso?.ts ?? s.h.ts}`;
    if (to && !given[key])
      out.push({ kind: 'desequilibrio', key, from: s.x, to: to.x, agent: to.agent, job, ramGB: to.h.ram?.disponibleGB ?? null });
  }
  return out;
}

// ---------- incidents and reports (M23) ----------
/**
 * Opt-in per project (`wassup.json: "incidencias": true`, set by the coordinator). Each session appends to
 * its own incidents/<me>.jsonl (incidencias/<yo>.jsonl in Spanish): one line per event, schema
 * `wassup-incidencia/1`. Nothing is ever sent: `report` writes a file that the user reads and, if they want,
 * sends by hand (GitHub Issues for Wassup, Claude Code's /feedback for the product).
 */
export const INCIDENT_SCHEMA = 'wassup-incidencia/1';
export const INCIDENT_TYPES = [
  'bloqueo-permiso',
  'mensaje-perdido',
  'sesion-saturada',
  'sesion-ociosa',
  'conflicto-fichero',
  'reintento',
  'error-script',
  'correccion',
  'idea',
];
/** Types that are about Claude Code or the model rather than Wassup (channel: /feedback). */
export const PRODUCT_TYPES = new Set(['bloqueo-permiso', 'mensaje-perdido']);
const INCIDENT_DAYS = 90;
const incidentsDir = (root, cfg) => path.join(root, cfg.t.incidents);

/**
 * Removes what must never travel: e-mails, phone numbers, tokens and keys, absolute paths and URL
 * paths/queries (the host stays). One line, 300 characters at most.
 */
export function scrub(text) {
  return String(text ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[correo]')
    .replace(/\b(?:sk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs]|AIza|ya29|AKIA)[-_A-Za-z0-9.]{8,}/g, '[token]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, '[token]')
    .replace(/\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{32,}={0,2}/g, '[token]')
    .replace(/\bhttps?:\/\/([^/\s?#]+)[^\s]*/gi, 'https://$1')
    .replace(/\b[A-Za-z]:[\\/][^\s"'`«»]*/g, '[ruta]')
    .replace(/(^|[\s"'`(«])(?:~|\/(?:Users|home|root|var|tmp|private|Volumes|mnt|opt|etc|srv))\/[^\s"'`»)]*/g, '$1[ruta]')
    .replace(/\\\\[^\s"'`«»]+/g, '[ruta]')
    .replace(/(?:\+|00)\d{1,3}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4}){2,4}\b/g, '[teléfono]')
    .replace(/\b[6789]\d{2}(?:[\s.-]?\d{2,3}){3}\b/g, '[teléfono]')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 300);
}

/**
 * `w log`: appends one incident to MY file (only I write it) and drops lines older than 90 days.
 * `claudeCode` is the Claude Code version if known (e.g. from `claude --version`); it is not guessed.
 */
export function logIncident({ root, me, tipo, texto, claudeCode, now = new Date() }) {
  const cfg = loadConfig(root);
  if (!cfg.sessions.includes(me)) throw new WassupError(`--me: «${me}» is not a session.`);
  if (cfg.incidencias !== true)
    throw new WassupError('Incidents are off for this project (opt-in): the coordinator enables them with «config --incidents on».');
  if (!INCIDENT_TYPES.includes(tipo)) throw new WassupError(`--tipo: one of ${INCIDENT_TYPES.join(', ')}.`);
  const clean = scrub(texto);
  if (!clean) throw new WassupError('--texto: one sentence describing what happened.');
  const dir = incidentsDir(root, cfg);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${me}.jsonl`);
  const cutoff = now.getTime() - INCIDENT_DAYS * 24 * 3600 * 1000;
  const kept = fs.existsSync(file)
    ? read(file)
        .split('\n')
        .filter((l) => {
          try {
            return l.trim() && new Date(JSON.parse(l).ts).getTime() >= cutoff;
          } catch {
            return false;
          }
        })
    : [];
  const entry = {
    schema: INCIDENT_SCHEMA,
    ts: now.toISOString(),
    sesion: me,
    wassup: VERSION,
    claudeCode: claudeCode && claudeCode !== true ? scrub(claudeCode).slice(0, 40) : null,
    so: process.platform,
    tipo,
    texto: clean,
  };
  kept.push(JSON.stringify(entry));
  writeAtomic(file, kept.join('\n') + '\n');
  return entry;
}

/** Every session's incidents since `desde` (YYYY-MM-DD), oldest first. */
export function readIncidents({ root, desde }) {
  const cfg = loadConfig(root);
  const dir = incidentsDir(root, cfg);
  const from = desde ? new Date(`${desde}T00:00:00`) : null;
  const out = [];
  for (const s of cfg.sessions) {
    const f = path.join(dir, `${s}.jsonl`);
    if (!fs.existsSync(f)) continue;
    for (const l of read(f).split('\n')) {
      if (!l.trim()) continue;
      try {
        const e = JSON.parse(l);
        if (e.schema !== INCIDENT_SCHEMA) continue;
        if (from && new Date(e.ts) < from) continue;
        out.push(e);
      } catch {
        /* a broken line is skipped */
      }
    }
  }
  return out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}

/**
 * `w report`: an ANONYMISED summary for the user to read before sending it anywhere. Sessions become
 * «A», «B»…; texts are scrubbed again. `retro`: adds the retrospective block (what failed, what repeated,
 * what to change). `issue`: a GitHub issue body for Wassup. Writes report-<date>.md in the shared folder.
 */
export function report({ root, desde, retro = false, issue = false, now = new Date() }) {
  const cfg = loadConfig(root);
  const es = cfg.lang === 'es';
  const all = readIncidents({ root, desde });
  const alias = new Map();
  const who = (s) => {
    if (!alias.has(s)) alias.set(s, String.fromCharCode(65 + (alias.size % 26)) + (alias.size >= 26 ? alias.size : ''));
    return alias.get(s);
  };
  all.forEach((e) => who(e.sesion));
  const sessionsWithIncidents = alias.size;
  // Session names inside the texts too (they can name a project or a client): each one → its letter.
  cfg.sessions.forEach((s) => who(s));
  const anon = (t) =>
    cfg.sessions.reduce(
      (x, s) => x.replace(new RegExp(`(^|[^\\p{L}\\p{N}_-])${s}(?=$|[^\\p{L}\\p{N}_-])`, 'giu'), `$1${who(s)}`),
      scrub(t),
    );
  const count = (key) => {
    const m = new Map();
    for (const e of all) m.set(key(e), (m.get(key(e)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  };
  const norm = (t) => anon(t).toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  const repeated = count((e) => `${e.tipo} · ${norm(e.texto)}`).filter(([, n]) => n > 1).slice(0, 5);
  const ideas = all.filter((e) => e.tipo === 'idea');
  const product = all.filter((e) => PRODUCT_TYPES.has(e.tipo));
  const day = now.toISOString().slice(0, 10);
  const L = [];
  const h = (es_, en_) => (es ? es_ : en_);
  L.push(issue ? h(`# Wassup · reporte de incidencias (${day})`, `# Wassup · incident report (${day})`) : h(`# Reporte de incidencias · ${day}`, `# Incident report · ${day}`));
  L.push('');
  L.push(
    h(
      `Anónimo (sesiones como A, B…; sin rutas, correos, teléfonos ni tokens). Formato \`${INCIDENT_SCHEMA}\`. **Léelo antes de enviarlo:** nada se envía solo.`,
      `Anonymised (sessions as A, B…; no paths, e-mails, phone numbers or tokens). Format \`${INCIDENT_SCHEMA}\`. **Read it before sending it:** nothing is sent automatically.`,
    ),
  );
  L.push('');
  L.push(h(`- Periodo: ${all[0]?.ts?.slice(0, 10) ?? '—'} → ${all.at(-1)?.ts?.slice(0, 10) ?? '—'} · ${all.length} incidencias · ${sessionsWithIncidents} sesiones`, `- Period: ${all[0]?.ts?.slice(0, 10) ?? '—'} → ${all.at(-1)?.ts?.slice(0, 10) ?? '—'} · ${all.length} incidents · ${sessionsWithIncidents} sessions`));
  L.push(h('- Versiones de Wassup: ', '- Wassup versions: ') + (count((e) => e.wassup).map(([v, n]) => `${v} (${n})`).join(', ') || '—'));
  L.push(h('- Claude Code: ', '- Claude Code: ') + (count((e) => e.claudeCode ?? h('desconocida', 'unknown')).map(([v, n]) => `${v} (${n})`).join(', ') || '—'));
  L.push(h('- Sistemas: ', '- Systems: ') + (count((e) => e.so).map(([v, n]) => `${v} (${n})`).join(', ') || '—'));
  L.push('');
  L.push(h('## Por tipo', '## By type'));
  L.push(h('| Tipo | Veces |', '| Type | Count |'));
  L.push('|---|---|');
  for (const [t, n] of count((e) => e.tipo)) L.push(`| ${t} | ${n} |`);
  L.push('');
  L.push(h('## Lo que más se repite', '## Most repeated'));
  L.push(repeated.length ? repeated.map(([k, n]) => `- ${k} (${n})`).join('\n') : h('- Nada se repite.', '- Nothing repeats.'));
  L.push('');
  L.push(h('## Ideas', '## Ideas'));
  L.push(ideas.length ? ideas.map((e) => `- ${anon(e.texto)} (${who(e.sesion)})`).join('\n') : '- —');
  if (!issue) {
    L.push('');
    L.push(h('## Detalle', '## Detail'));
    for (const e of all) L.push(`- ${e.ts.slice(0, 16).replace('T', ' ')} · ${who(e.sesion)} · ${e.tipo} · ${anon(e.texto)}`);
  }
  if (retro) {
    const failed = all.filter((e) => ['bloqueo-permiso', 'mensaje-perdido', 'error-script', 'conflicto-fichero', 'correccion'].includes(e.tipo));
    const idle = all.filter((e) => ['sesion-ociosa', 'sesion-saturada'].includes(e.tipo));
    L.push('');
    L.push(h('## Retrospectiva', '## Retrospective'));
    L.push(h('### Qué falló', '### What failed'));
    L.push(failed.length ? failed.map((e) => `- ${e.tipo}: ${anon(e.texto)}`).join('\n') : '- —');
    L.push(h('### Qué se repitió', '### What repeated'));
    L.push(repeated.length ? repeated.map(([k, n]) => `- ${k} (${n})`).join('\n') : '- —');
    L.push(h('### Qué cambiar', '### What to change'));
    const change = [];
    if (all.some((e) => e.tipo === 'bloqueo-permiso'))
      change.push(h('Pasar el cuestionario de permisos (§3 quinquies) antes de que el usuario se vaya.', 'Run the permissions questionnaire (§3e) before the user leaves.'));
    if (idle.length) change.push(h('Repartir antes de hacer: «libre» al terminar y `w health`/`w status` (§5 bis).', 'Hand work out before doing it: "free" when done and `w health`/`w status` (§5b).'));
    if (all.some((e) => e.tipo === 'correccion')) change.push(h('Comprobar en la fuente antes de dar un dato por bueno.', 'Check the source before calling a figure right.'));
    if (all.some((e) => e.tipo === 'conflicto-fichero')) change.push(h('Un dueño por fichero; declarar los que están en uso.', 'One owner per file; declare the ones in use.'));
    for (const e of ideas) change.push(anon(e.texto));
    L.push(change.length ? change.map((x) => `- ${x}`).join('\n') : '- —');
  }
  L.push('');
  L.push(h('## Dónde enviarlo (a mano)', '## Where to send it (by hand)'));
  L.push(h('- Wassup: una *issue* en el repositorio de Wassup en GitHub (`w report --issue` deja el texto listo).', '- Wassup: an issue in the Wassup repository on GitHub (`w report --issue` prepares the text).'));
  L.push(
    product.length
      ? h(`- Claude Code o el modelo: ${product.length} incidencias de ese tipo (${[...new Set(product.map((e) => e.tipo))].join(', ')}): \`/feedback\` o \`/bug\` en Claude Code.`, `- Claude Code or the model: ${product.length} such incidents (${[...new Set(product.map((e) => e.tipo))].join(', ')}): \`/feedback\` or \`/bug\` in Claude Code.`)
      : h('- Claude Code o el modelo: ninguna incidencia de ese tipo.', '- Claude Code or the model: no such incidents.'),
  );
  const text = L.join('\n') + '\n';
  const file = path.join(root, `${cfg.t.report}-${day}${issue ? '-issue' : ''}.md`);
  writeAtomic(file, text);
  return { file, text, total: all.length, product: product.length };
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
  remind   --root <shared> --me <me> [--json]               reminders due now (waiting time × recipient load)
  remind   --root <shared> --me <me> --mark <to>#<n> --level <1|2|3>   note a notice as given
  remind   --root <shared> --me <me> --close-all             close everything pending now (migrating an old mailbox)
  config   --root <shared> --by <coordinator> [--mode escalate|auto] [--base <min>] [--max <min>]
           [--assist-min <load>] [--assist-own <load>] [--assist-cooldown <min>]
  assist   --root <shared> --me <me> [--json]               who is overloaded and could use my help
  assist   --root <shared> --me <me> --mark <other>          note that I offered (cooldown)
  init     … --caps "playwright, safari, cred:<project>"      my machine's capabilities (never secrets)
  health   --root <shared> --me <me> [--json] [--quiet]        measure RAM, disk, load and heat → health-<me>.json
           [--busy "<heavy job>" [--needs a,b]] [--watch <s>]  exit code: 0 ok · 1 tight · 2 saturated
  config   … [--ram-min <GB>] [--ram-tight <GB>] [--load-max <per core>] [--disk-repo-min <GB>]
           [--disk-shared-min <GB>] [--free-remind <min>]      resource thresholds (coordinator)
  log      --root <shared> --me <me> --tipo <type> --texto "…" [--cc <version>]   note an incident (opt-in: config --incidents on)
           types: bloqueo-permiso, mensaje-perdido, sesion-saturada, sesion-ociosa, conflicto-fichero, reintento,
           error-script, correccion, idea · e-mails, phones, tokens and absolute paths are removed · kept 90 days
  report   --root <shared> [--desde YYYY-MM-DD] [--retro] [--issue]   anonymised report for the user to read; never sent
  config   … [--incidents on|off]                            incidents opt-in (coordinator)
  --version
«Read from X up to: #N» means «reviewed up to #N», including messages that were not addressed to you.
send --re 4,6 marks the message as the answer to #4 and #6 of the recipient (stops their reminders).`;

async function main(argv) {
  const a = args(argv);
  const cmd = a._[0];
  const root = a.root ? path.resolve(String(a.root)) : null;
  if (a.version || cmd === 'version') return console.log(VERSION);
  if (!cmd || cmd === 'help' || a.help) return console.log(HELP);
  if (!root) throw new WassupError('--root <shared folder> is required.');
  switch (cmd) {
    case 'init': {
      const r = init({ root, name: a.name, lang: a.lang, agent: a.agent, caps: a.caps });
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
      const r = send({ root, from: a.from, to: a.to, subject: a.subject, body, expect: a.expect, commit: a.commit, re: a.re });
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
      const now = Date.now();
      for (const s of r) {
        const h = s.health;
        const hl = h
          ? ` · ${h.estado === 'saturado' ? 'SATURADO' : h.estado}${h.libreDesde ? ` · libre ${Math.floor((now - new Date(h.libreDesde).getTime()) / 60000)} min` : ''}${h.ramGB != null ? ` · RAM ${h.ramGB} GB` : ''}${h.compartidaGB != null ? ` · shared ${h.compartidaGB} GB` : ''}${h.pesadoEnCurso ? ` · ${h.pesadoEnCurso}` : ''}`
          : '';
        console.log(
          `${s.session.padEnd(12)}${s.coordinator ? '*' : ' '} last #${s.lastMessage} ${s.lastDate ?? ''} · unread ${s.unread}${s.agent ? ` · ${s.agent}` : ''}${hl}${s.caps.length ? ` · [${s.caps.join(', ')}]` : ''}`,
        );
      }
      return;
    }
    case 'remind': {
      const cfg = loadConfig(root);
      if (a['close-all']) return console.log(`ok · ${closeAll({ root, me: a.me })}`);
      if (a.mark) {
        const r = markReminded({ root, me: a.me, key: a.mark, level: a.level });
        return console.log(`ok · ${Object.entries(r).map(([k, v]) => `${k}=${v}`).join(' · ') || '—'}`);
      }
      const r = remind({ root, me: a.me, now: a.now ? new Date(String(a.now)) : new Date() });
      if (a.json) return console.log(JSON.stringify(r, null, 2));
      if (!r.length) return console.log(cfg.t.noReminders);
      for (const x of r)
        console.log(
          x.kind === 'libre'
            ? `${cfg.t.free(x)} · --mark ${x.key}`
            : x.kind === 'desequilibrio'
              ? `${cfg.t.imbalance(x)} · --mark ${x.key}`
              : cfg.t.reminder(x),
        );
      return;
    }
    case 'config': {
      const r = configure({
        root,
        by: a.by,
        mode: a.mode,
        base: a.base,
        max: a.max,
        assistMin: a['assist-min'],
        assistOwn: a['assist-own'],
        assistCooldown: a['assist-cooldown'],
        recursos: {
          ramDisponibleMinGB: a['ram-min'],
          ramJustoGB: a['ram-tight'],
          cargaMaxPorNucleo: a['load-max'],
          discoRepoMinGB: a['disk-repo-min'],
          discoCompartidaMinGB: a['disk-shared-min'],
          libreRecordarMin: a['free-remind'],
        },
        incidents: a.incidents,
      });
      return console.log(
        `ok · reminders: ${r.mode} · base ${r.baseMin} min · max ${r.maxMin} min · assist: load ≥ ${r.assist.minLoad}, own ≤ ${r.assist.ownMax}, every ${r.assist.cooldownMin} min · resources: ${JSON.stringify(r.recursos)}`,
      );
    }
    case 'log': {
      const e = logIncident({ root, me: a.me, tipo: a.tipo, texto: a.texto, claudeCode: a.cc });
      return console.log(`ok · ${e.tipo} · ${e.texto}`);
    }
    case 'report': {
      const r = report({ root, desde: a.desde && a.desde !== true ? String(a.desde) : undefined, retro: !!a.retro, issue: !!a.issue });
      return console.log(`ok · ${r.total} · ${r.file}${r.product ? ` · Claude Code: ${r.product} → /feedback` : ''}`);
    }
    case 'health': {
      // --watch <s>: repeat while a heavy job is marked (--busy), then stop on its own (at most 4 h).
      const once = async (first) =>
        health({
          root,
          me: a.me,
          busy: first && a.busy !== undefined ? (a.busy === true ? '' : String(a.busy)) : undefined,
          needs: first && a.needs !== undefined && a.needs !== true ? String(a.needs) : undefined,
        });
      let r = await once(true);
      if (a.watch) {
        const every = Math.max(10, Number(a.watch) || 60) * 1000;
        const until = Date.now() + 4 * 3600 * 1000;
        while (r.trabajo.pesadoEnCurso && Date.now() < until) {
          await new Promise((res) => setTimeout(res, every));
          r = await once(false);
        }
      }
      process.exitCode = r.code;
      if (a.quiet) return;
      if (a.json) return console.log(JSON.stringify(r, null, 2));
      return console.log(
        `${r.estado}${r.motivos.length ? ` · ${r.motivos.join('; ')}` : ''} · RAM ${r.ram.disponibleGB ?? '?'} GB · load ${r.cpu.cargaPorNucleo}/core · repo ${r.disco.repoLibreGB ?? '?'} GB · shared ${r.disco.compartidaLibreGB ?? '?'} GB · thermal ${r.termica.estado}${r.sent ? ` · sent #${r.sent}` : ''}`,
      );
    }
    case 'assist': {
      const cfg = loadConfig(root);
      if (a.mark) {
        const r = markAssist({ root, me: a.me, to: String(a.mark) });
        return console.log(`ok · ${Object.keys(r).join(', ')}`);
      }
      const r = assist({ root, me: a.me, now: a.now ? new Date(String(a.now)) : new Date() });
      if (a.json) return console.log(JSON.stringify(r, null, 2));
      if (!r.offers.length) return console.log(cfg.t.noAssist(r.myLoad));
      for (const o of r.offers) console.log(cfg.t.assistOffer(o));
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
