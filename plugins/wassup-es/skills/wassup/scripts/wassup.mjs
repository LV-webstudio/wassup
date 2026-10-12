#!/usr/bin/env node
// Wassup · helper for the mailbox between Claude Code sessions. Node 18+, no dependencies.
// © 2026 Shania Webstudio (Speccy81) · MIT
//
// The script numbers messages and works out what is unread; Claude writes the words.
// Each session only ever writes its own files (mailbox/<name>.md, STATUS-<name>.md): the golden rule.
//
//   node wassup.mjs init     --root <shared> --name <me> --maquina <machine> [--lang es|en] [--agent "<name in ListAgents>[ | <name on another machine>]"]
//                            (the first init creates wassup.json and makes that session the coordinator)
//   node wassup.mjs register --root <shared> --by <coordinator> --name <new session>
//   node wassup.mjs send     --root <shared> --from <me> --to <a,b|all> --subject "…"
//                            (--body "…" | --body-file <file>) [--expect "…"] [--commit auto|<hash>]
//   node wassup.mjs unread   --root <shared> --me <me> [--json] [--resumen]
//   node wassup.mjs show     --root <shared> --de <session> --num <n>
//   node wassup.mjs wait     --root <shared> --me <me> [--timeout <s>] [--interval <s>]
//   node wassup.mjs ack      --root <shared> --me <me> (--all | --from <other> --upto <n>)
//   node wassup.mjs status   --root <shared> [--json]
//   node wassup.mjs remind   --root <shared> --me <me> [--json] [--mark <to>#<n> --level <k> | --close-all]
//   node wassup.mjs config   --root <shared> --by <coordinator> [--mode escalate|auto] [--base <min>] [--max <min>]
//   node wassup.mjs health   --root <shared> --me <me> [--busy "<heavy job>" [--needs a,b]] [--json] [--quiet] [--watch <s>]
//   node wassup.mjs log      --root <shared> --me <me> --tipo <type> --texto "…" [--cc <Claude Code version>]
//   node wassup.mjs report   --root <shared> [--desde YYYY-MM-DD] [--retro] [--issue]
//   node wassup.mjs lock     --root <shared> --me <me> [build] [--tarea "…"] · unlock --root <shared> --me <me> [build]
//   node wassup.mjs run      --root <shared> --me <me> --tipo build -- npm run build
//   node wassup.mjs awake    --root <shared> --me <me> [--hasta HH:MM|--mientras-pid N|--horas H] [--stop]
//   node wassup.mjs barrer   <carpeta> [--json] [--lang es|en]   (M51: secretos y datos personales, sin el valor)
//   node wassup.mjs compactar --root <shared> --me <me> --memoria <carpeta> [--repo <carpeta>|none] · retomado --root <shared> --me <me>   (M64)
//   node wassup.mjs red      --root <shared> --me <me> [--apago HH:MM]   (0.12: IP privada y hora, solas)
//   node wassup.mjs huellas  <carpeta> [--sellar]                     (0.12: HUELLAS.txt; nunca reescribe sin --sellar)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEXT = {
  es: {
    dir: 'buzon', status: 'ESTADO', proposals: 'desde', title: 'Buzón de', to: 'Para', subject: 'Asunto',
    expect: 'Espero de ti', all: 'todas', read: (o, n) => `Leído de ${o} hasta: #${n}`,
    owner: (n) => `Lo escribe solo la sesión ${n}. No lo edites a mano: usa \`wassup.mjs send\` y \`ack\`.`,
    statusHead: (n) => `# Estado de ${n}\nActualizado: — · Commit probado: —\n\n## Resultado\n| Prueba / tarea | Resultado | Detalle |\n|---|---|---|\n`,
    none: 'Nada sin leer.', unreadFrom: (o, k) => `${o}: ${k} sin leer`, expects: 'espera de ti',
    agent: 'Sesión de Claude Code', machine: 'Máquina', network: 'Red', timeout: 'Nada nuevo en el tiempo de espera.',
    reply: 'En respuesta a', noReminders: 'Nada que recordar.', caps: 'Capacidades', health: 'salud', incidents: 'incidencias', report: 'reporte',
    free: (r) => `${r.to} · libre ${r.freeMin} min y con recursos${r.ramGB != null ? ` (RAM ${String(r.ramGB).replace('.', ',')} GB)` : ''} → asígnale algo o confirma que espere${r.agent ? ` (${r.agent})` : ''}`,
    imbalance: (r) => `desequilibrio: ${r.from} SATURADO con «${r.job}» → ${r.to} libre${r.ramGB != null ? `, ${String(r.ramGB).replace('.', ',')} GB` : ''}: propón moverlo${r.agent ? ` (${r.agent})` : ''}`,
    noAssist: (l) => `Nadie necesita ayuda ahora (tu carga: ${l}).`,
    assistOffer: (o) => `${o.to} · carga ${o.load} → ofrécele ayuda${o.agent ? ` (${o.agent})` : ''}`,
    direct: (f, n, s) => `para el aviso directo: ${f}#${n} en el buzón: ${s}`,
    reAbout: (n, s) => `responde a #${n}: ${s}`,
    pending: (x) => `pendiente de contestar: ${x.from}#${x.n} ${x.subject} · espera: ${x.expect}`,
    reminder: (r) => `${r.to} · #${r.n} ${r.subject} · esperando ${r.waitedMin} min (carga ${r.load}, umbral ${r.thresholdMin} min) · aviso ${r.level} → ${r.action === 'user' ? 'avisa a la persona' : 'recordatorio directo'}${r.agent ? ` (${r.agent})` : ''}`,
    compacting: (r) => `${r.to} · compactando desde hace ${r.min} min sin «w retomado» → comprueba que ha retomado; si no, sesión nueva con la palabra de recuperación${r.agent ? ` (${r.agent})` : ''}`,
  },
  en: {
    dir: 'mailbox', status: 'STATUS', proposals: 'from', title: 'Mailbox of', to: 'To', subject: 'Subject',
    expect: 'I expect from you', all: 'all', read: (o, n) => `Read from ${o} up to: #${n}`,
    owner: (n) => `Written only by session ${n}. Do not edit by hand: use \`wassup.mjs send\` and \`ack\`.`,
    statusHead: (n) => `# Status of ${n}\nUpdated: — · Commit tested: —\n\n## Result\n| Test / task | Result | Detail |\n|---|---|---|\n`,
    none: 'Nothing unread.', unreadFrom: (o, k) => `${o}: ${k} unread`, expects: 'expects from you',
    agent: 'Claude Code session', machine: 'Machine', network: 'Network', timeout: 'Nothing new within the timeout.',
    reply: 'In reply to', noReminders: 'Nothing to remind.', caps: 'Capabilities', health: 'health', incidents: 'incidents', report: 'report',
    free: (r) => `${r.to} · free for ${r.freeMin} min with resources${r.ramGB != null ? ` (RAM ${r.ramGB} GB)` : ''} → give it something or confirm it should wait${r.agent ? ` (${r.agent})` : ''}`,
    imbalance: (r) => `imbalance: ${r.from} SATURATED with «${r.job}» → ${r.to} is free${r.ramGB != null ? `, ${r.ramGB} GB` : ''}: suggest moving it${r.agent ? ` (${r.agent})` : ''}`,
    noAssist: (l) => `Nobody needs help right now (your load: ${l}).`,
    assistOffer: (o) => `${o.to} · load ${o.load} → offer help${o.agent ? ` (${o.agent})` : ''}`,
    direct: (f, n, s) => `for the direct notice: ${f}#${n} in the mailbox: ${s}`,
    reAbout: (n, s) => `answers #${n}: ${s}`,
    pending: (x) => `still to answer: ${x.from}#${x.n} ${x.subject} · expects: ${x.expect}`,
    reminder: (r) => `${r.to} · #${r.n} ${r.subject} · waiting ${r.waitedMin} min (load ${r.load}, threshold ${r.thresholdMin} min) · notice ${r.level} → ${r.action === 'user' ? 'tell the person' : 'direct reminder'}${r.agent ? ` (${r.agent})` : ''}`,
    compacting: (r) => `${r.to} · compacting for ${r.min} min without «w retomado» → check it has resumed; if not, a new session with the recovery word${r.agent ? ` (${r.agent})` : ''}`,
  },
};
const ALL = new Set(['all', 'todas', 'todos', '*']);
const NOTHING = /^\s*(?:nada|ninguna?|nothing|none|n\/a|—|-)(?=[\s.,;:]|$)/i;
const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const VERSION = '0.13.0';

/**
 * Error para quien usa wassup: en español y en inglés. `message` va en inglés (lo que miran las pruebas);
 * al salir por pantalla se elige el idioma del proyecto (idiomaDeSalida). Con un solo texto, vale para los dos.
 */
export class WassupError extends Error {
  constructor(es, en = es) {
    super(en);
    this.es = es;
    this.en = en;
  }
  texto(lang) {
    return lang === 'es' ? this.es : this.en;
  }
}

/**
 * Idioma de los errores: el del wassup.json de --root si lo hay; si no, WASSUP_LANG; si no, el del
 * sistema (es si empieza por «es»); en otro caso, inglés.
 */
export function idiomaDeSalida(argv, env = process.env) {
  const i = argv.indexOf('--root');
  const root = i >= 0 ? argv[i + 1] : null;
  if (root) {
    try {
      const lang = JSON.parse(read(path.join(root, 'wassup.json'))).lang;
      if (lang === 'es' || lang === 'en') return lang;
    } catch {
      /* sin wassup.json todavía */
    }
  }
  if (env.WASSUP_LANG === 'es' || env.WASSUP_LANG === 'en') return env.WASSUP_LANG;
  const sis = String(env.LANG || env.LC_ALL || Intl.DateTimeFormat().resolvedOptions().locale || '');
  return /^es/i.test(sis) ? 'es' : 'en';
}

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
  if (!fs.existsSync(f)) throw new WassupError(`No hay wassup.json en ${root}: ejecuta antes «init».`, `No wassup.json in ${root}: run «init» first.`);
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
      // 0.12 (A1): «decision: …» lleva una decisión de la titular (cita literal): `unread` la destaca.
      decision: /^\s*decisi[oó]n\s*:/i.test(subject),
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
export function init({ root, name, lang = 'es', agent, caps, maquina, redIp = ipPrivada() }) {
  if (!NAME.test(name ?? '')) throw new WassupError('--name: minúsculas, cifras, - o _ (como mucho 32).', '--name: lowercase letters, digits, - or _ (max 32).');
  if (!TEXT[lang]) throw new WassupError('--lang: es o en.', '--lang: es or en.');
  if (maquina !== undefined && !NAME.test(String(maquina)))
    throw new WassupError(
      '--maquina: minúsculas, cifras, - o _ (como mucho 32), y sin nombres de personas (p. ej., «pc-casa» o «mac-oficina»).',
      '--maquina: lowercase letters, digits, - or _ (max 32), and no people\'s names (e.g. «home-pc» or «office-mac»).',
    );
  if (caps !== undefined && caps !== true) validarCaps(String(caps));
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
        `«${name}» no está dada de alta. Pide a la coordinadora (${cfg.coordinator ?? cfg.sessions[0]}) que ejecute: register --name ${name}`, `«${name}» is not registered. Ask the coordinator (${cfg.coordinator ?? cfg.sessions[0]}) to run: register --name ${name}`,
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
  if (maquina) setMaquina(mb, t, String(maquina));
  if (caps !== undefined && caps !== true) setCaps(mb, t, String(caps));
  // 0.12 (A6): la versión de Wassup de esta sesión, en su buzón.
  writeAtomic(mb, conVersion(read(mb)));
  const st = path.join(root, `${t.status}-${name}.md`);
  if (!fs.existsSync(st)) writeAtomic(st, t.statusHead(name));
  // 0.12 (A7): la red de esta máquina, sola SI el proyecto la tiene encendida (`config --red on`). Un fallo aquí no para el init.
  let r = null;
  try {
    r = red({ root, me: name, ip: redIp });
  } catch {
    /* sin red legible: no importa para el buzón */
  }
  return { root, name, lang: cfg.lang, coordinator: cfg.coordinator ?? cfg.sessions[0], sessions: cfg.sessions, maquina: maquinaOf(read(mb)), red: r };
}

/** The coordinator adds a session to wassup.json (the only writer of that file). */
export function register({ root, by, name }) {
  const cfgFile = path.join(root, 'wassup.json');
  const cfg = loadConfig(root);
  const coordinator = cfg.coordinator ?? cfg.sessions[0];
  if (!by || by === true) throw new WassupError(`Falta --by <coordinadora> (la coordinadora es «${coordinator}»).`, `--by <coordinator> is missing (the coordinator is «${coordinator}»).`);
  if (by !== coordinator) throw new WassupError(`Solo la coordinadora (${coordinator}) da de alta sesiones.`, `Only the coordinator (${coordinator}) registers sessions.`);
  if (!NAME.test(name ?? '')) throw new WassupError('--name: minúsculas, cifras, - o _ (como mucho 32).', '--name: lowercase letters, digits, - or _ (max 32).');
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

// ---------- M69 · la máquina se declara, nunca se lee del sistema ----------
/**
 * «Máquina: <nombre>» en MI buzón. La elige la persona al hacer `init --maquina` (sin nombres de personas);
 * Wassup nunca toma os.hostname(). El id del equipo (cerrojos, salud, awake) es su hash corto; sin máquina
 * declarada, todas comparten «sin-maquina» (mejor un cerrojo de más que dos tareas pesadas a la vez).
 */
const RE_MAQUINA = /^(?:Máquina|Machine): (.+)$/m;
export const maquinaOf = (text) => (String(text ?? '').match(RE_MAQUINA) ?? [])[1]?.trim() ?? null;

function setMaquina(file, t, maquina) {
  const text = read(file);
  const line = `${t.machine}: ${maquina}`;
  const next = RE_MAQUINA.test(text) ? text.replace(RE_MAQUINA, line) : text.replace(/^(# .+\n.+\n)/, `$1${line}\n`);
  writeAtomic(file, next);
}

/** La máquina declarada por una sesión (o null), leyendo su buzón. */
export function maquinaDe(root, me) {
  try {
    const cfg = loadConfig(root);
    return maquinaOf(read(mailboxFile(root, cfg, me)));
  } catch {
    return null;
  }
}

/** Id corto del equipo de una sesión: hash de su máquina declarada. */
export const equipoDe = (root, me) => crypto.createHash('sha256').update(maquinaDe(root, me) || 'sin-maquina').digest('hex').slice(0, 8);

function gitShortHead(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/** Local date and time WITH the UTC offset (M35): the PC and the Mac may be in different zones or seasons. */
export function stamp(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const zone = `${off < 0 ? '-' : '+'}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} ${zone}`;
}

// ---------- M51 · secretos y datos personales ----------
/**
 * Secretos evidentes: BLOQUEAN `send` y `log`. Cada patrón exige la forma completa del secreto (no basta la
 * palabra), para no parar un mensaje que solo habla de claves. Los hashes de commits o de ficheros no cuentan.
 */
const SECRETOS = [
  ['clave-privada', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g],
  ['cuenta-de-servicio', /"type"\s*:\s*"service_account"/g],
  ['private_key', /"private_key(?:_id)?"\s*:\s*"[^"\s]{16,}/g],
  ['token-github', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/g],
  ['token-slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['clave-aws', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['clave-google', /\bAIza[0-9A-Za-z_-]{35}/g],
  ['token-google', /\bya29\.[0-9A-Za-z_-]{20,}/g],
  ['clave-anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}/g],
  ['clave-api', /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{32,}|(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}|npm_[A-Za-z0-9]{36})/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  // «api_key = …», «password: …» con un valor sin espacios de 16 o más, con letras y cifras.
  ['asignacion', /\b(?:api[_-]?key|secret|client[_-]?secret|access[_-]?token|auth[_-]?token|password|passwd|contrase(?:ñ|n)a)["']?\s*[:=]\s*["']?(?=[A-Za-z0-9_\-+/=.]*\d)(?=[A-Za-z0-9_\-+/=.]*[A-Za-z])[A-Za-z0-9_\-+/=.]{16,}/gi],
];

const LETRA_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
const dniValido = (num, letra) => LETRA_DNI[Number(num) % 23] === letra.toUpperCase();

/** IBAN con el dígito de control (ISO 13616, módulo 97). */
export function ibanValido(iban) {
  const s = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const num = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let r = 0;
  for (const d of num) r = (r * 10 + Number(d)) % 97;
  return r === 1;
}

/** Datos personales: AVISAN (no bloquean) en la Básica. Solo cuentan los que pasan su control. */
const DATOS = [
  ['dni', /\b(\d{8})[- ]?([A-Za-z])\b/g, (m) => dniValido(m[1], m[2])],
  ['nie', /\b([XYZxyz])[- ]?(\d{7})[- ]?([A-Za-z])\b/g, (m) => dniValido('XYZ'.indexOf(m[1].toUpperCase()) + m[2], m[3])],
  [
    'iban',
    /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g,
    // El último grupo corto puede ser una palabra que sigue al IBAN («… 1332 OK»): se prueba con y sin él.
    (m) => ibanValido(m[0]) || ibanValido(m[0].replace(/ ?[A-Z0-9]{1,3}$/, '')),
  ],
];

const lineaDe = (text, index) => text.slice(0, index).split('\n').length;

/**
 * M51: lo que hay en un texto, SIN el valor: [{ nivel: 'secreto'|'dato', tipo, linea }]. Ningún llamante
 * recibe el texto encontrado, así que no puede acabar en un registro, un mensaje ni un error.
 */
export function detectar(text) {
  const s = String(text ?? '').replace(/\r\n/g, '\n');
  const out = [];
  for (const [tipo, re] of SECRETOS) for (const m of s.matchAll(re)) out.push({ nivel: 'secreto', tipo, linea: lineaDe(s, m.index) });
  for (const [tipo, re, ok] of DATOS) for (const m of s.matchAll(re)) if (ok(m)) out.push({ nivel: 'dato', tipo, linea: lineaDe(s, m.index) });
  const visto = new Set();
  return out
    .filter((h) => {
      const k = `${h.nivel}|${h.tipo}|${h.linea}`;
      return visto.has(k) ? false : visto.add(k);
    })
    .sort((a, b) => a.linea - b.linea);
}

const TIPO_TEXTO = {
  es: { 'clave-privada': 'clave privada', 'cuenta-de-servicio': 'JSON de cuenta de servicio', private_key: 'campo private_key', 'token-github': 'token de GitHub', 'token-slack': 'token de Slack', 'clave-aws': 'clave de AWS', 'clave-google': 'API key de Google', 'token-google': 'token de Google', 'clave-anthropic': 'API key de Anthropic', 'clave-api': 'API key', jwt: 'token JWT', asignacion: 'contraseña o clave asignada', dni: 'DNI', nie: 'NIE', iban: 'IBAN' },
  en: { 'clave-privada': 'private key', 'cuenta-de-servicio': 'service account JSON', private_key: 'private_key field', 'token-github': 'GitHub token', 'token-slack': 'Slack token', 'clave-aws': 'AWS key', 'clave-google': 'Google API key', 'token-google': 'Google token', 'clave-anthropic': 'Anthropic API key', 'clave-api': 'API key', jwt: 'JWT', asignacion: 'assigned password or key', dni: 'DNI (Spanish ID)', nie: 'NIE (Spanish foreigner ID)', iban: 'IBAN' },
};
export const tipoTexto = (tipo, lang = 'es') => TIPO_TEXTO[lang === 'es' ? 'es' : 'en'][tipo] ?? tipo;

/** «--body, línea 3: clave privada» · sin el valor. */
const dondeTexto = (h, lang) => `${h.fichero ?? h.campo}${lang === 'es' ? ', línea' : ', line'} ${h.linea}: ${tipoTexto(h.tipo, lang)}`;

/**
 * M51 al escribir: bloquea si hay un secreto en alguno de los campos ({ '--body': texto, … }) y devuelve
 * los avisos de datos personales. El error dice el campo, la línea y el tipo; nunca el valor.
 */
export function comprobarSalida(campos) {
  const hallazgos = Object.entries(campos).flatMap(([campo, texto]) => detectar(texto).map((h) => ({ ...h, campo })));
  const secretos = hallazgos.filter((h) => h.nivel === 'secreto');
  if (secretos.length)
    throw new WassupError(
      `Bloqueado: hay un secreto y Wassup no lo envía ni lo guarda (${secretos.map((h) => dondeTexto(h, 'es')).join('; ')}). Quítalo y pásalo por una ruta local o un USB cifrado.`,
      `Blocked: there is a secret and Wassup neither sends nor keeps it (${secretos.map((h) => dondeTexto(h, 'en')).join('; ')}). Remove it and pass it through a local path or an encrypted USB.`,
    );
  return hallazgos.filter((h) => h.nivel === 'dato');
}

const BARRER_SALTA = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '.turbo', '.cache']);
const BARRER_MAX_BYTES = 2 * 1024 * 1024;

/**
 * `w barrer <carpeta>` (M51, el mismo motor que M64): todos los ficheros de texto de la carpeta, sin
 * .git, node_modules ni salidas de compilación, ni ficheros de más de 2 MB o binarios.
 * Devuelve { ficheros, saltados, hallazgos: [{ fichero (relativo), linea, nivel, tipo }] }.
 */
export function barrer({ carpeta }) {
  if (!carpeta || carpeta === true) throw new WassupError('Falta la carpeta: w barrer <carpeta>.', 'The folder is missing: w barrer <folder>.');
  const base = path.resolve(String(carpeta));
  if (!fs.existsSync(base)) throw new WassupError(`No existe ${base}.`, `${base} does not exist.`);
  const out = { carpeta: base, ficheros: 0, saltados: 0, hallazgos: [] };
  const visitar = (f) => {
    const st = fs.statSync(f);
    if (st.isDirectory()) {
      if (f !== base && BARRER_SALTA.has(path.basename(f))) return;
      for (const x of fs.readdirSync(f).sort()) visitar(path.join(f, x));
      return;
    }
    if (!st.isFile()) return;
    if (st.size > BARRER_MAX_BYTES) return void out.saltados++;
    const buf = fs.readFileSync(f);
    if (buf.subarray(0, 8192).includes(0)) return void out.saltados++;
    out.ficheros++;
    const fichero = path.relative(base, f).split(path.sep).join('/') || path.basename(f);
    for (const h of detectar(buf.toString('utf8'))) out.hallazgos.push({ fichero, ...h });
  };
  visitar(base);
  return out;
}

// ---------- M67 · «Prueba:» al decir que algo está hecho ----------
/**
 * Detector común con Speccy81: la etiqueta vale en 7 idiomas, al principio de una línea (con viñeta o sin
 * ella). Las palabras que la exigen van en 6 idiomas; en neerlandés y polaco se reconoce la etiqueta, pero
 * no las palabras (límite documentado). Los mensajes de Wassup siguen solo en es y en.
 */
const ETIQUETA_PRUEBA = /^\s*(?:[-*]\s+)?(?:Prueba|Proof|Prova|Preuve|Nachweis|Bewijs|Dowód)[\s ]?:/imu;
const DISPARADORAS = {
  es: ['hecho', 'comprobado', 'subido', 'desplegado', 'borrado', 'instalado', 'publicado', 'aplicado'],
  en: ['done', 'verified', 'uploaded', 'deployed', 'deleted', 'installed', 'published', 'applied'],
  pt: ['feito', 'verificado', 'enviado', 'implantado', 'apagado', 'instalado', 'publicado', 'aplicado'],
  fr: ['fait', 'vérifié', 'envoyé', 'déployé', 'supprimé', 'installé', 'publié', 'appliqué'],
  it: ['fatto', 'verificato', 'caricato', 'distribuito', 'cancellato', 'installato', 'pubblicato', 'applicato'],
  de: ['erledigt', 'geprüft', 'hochgeladen', 'bereitgestellt', 'gelöscht', 'installiert', 'veröffentlicht', 'angewendet'],
};
const RE_DISPARADORA = new RegExp(
  `(?<![\\p{L}\\p{N}])(${[...new Set(Object.values(DISPARADORAS).flat())].join('|')})(?![\\p{L}\\p{N}])`,
  'giu',
);
export const PRUEBA_MODOS = ['aviso', 'estricta', 'off'];

/** M67: ¿dice que algo está hecho sin una línea «Prueba:»? Devuelve las palabras que lo disparan (como mucho 3). */
export function faltaPrueba(texto) {
  const s = String(texto ?? '');
  if (ETIQUETA_PRUEBA.test(s)) return { falta: false, palabras: [] };
  const palabras = [...new Set([...s.matchAll(RE_DISPARADORA)].map((m) => m[1].toLowerCase()))].slice(0, 3);
  return { falta: palabras.length > 0, palabras };
}

// ---------- M64 · compactar y retomado ----------
/**
 * `w compactar --memoria <carpeta>`: antes de compactar el contexto, comprueba que la memoria está al día y
 * limpia, avisa a la coordinadora y marca «compactando»; `w retomado` lo cierra. Si pasan más de 30 min sin
 * `retomado`, `remind` lo recuerda (a la coordinadora y a la propia sesión).
 */
export const COMPACTAR_MAX_MIN = 30;
const compactandoFile = (root, me) => path.join(root, `compactando-${me}.json`);

/** La marca «compactando» de una sesión ({ desde, commit }) o null. */
export function compactandoDe(root, me) {
  try {
    return JSON.parse(read(compactandoFile(root, me)));
  } catch {
    return null;
  }
}

/** ¿Cita el texto el commit `hash`? Vale cualquier forma de 7 o más caracteres (corta o larga). */
const citaCommit = (text, hash) => [...String(text).matchAll(/\b[0-9a-f]{7,40}\b/gi)].some((m) => {
  const c = m[0].toLowerCase();
  const h = hash.toLowerCase();
  return c.startsWith(h) || h.startsWith(c);
});

/** A quién se avisa: la coordinadora; si la que compacta es la coordinadora, a todas (null si está sola). */
function avisoCompactar(cfg, me) {
  const coord = cfg.coordinator ?? cfg.sessions[0];
  if (coord !== me) return coord;
  return cfg.sessions.some((s) => s !== me) ? 'all' : null;
}

/**
 * M64: se niega (sin marcar ni avisar) si falta `retomar.md`, si tiene más de 30 min, si hay repo y no cita
 * su commit actual, o si el barrido de M51 encuentra un secreto en la memoria (fichero y línea, nunca el
 * valor). Sin repo basta con la fecha. Devuelve { desde, commit, edadMin, ficheros, avisos, n }.
 */
export function compactar({ root, me, memoria, repo, now = new Date() }) {
  const cfg = loadConfig(root);
  if (!cfg.sessions.includes(me)) throw new WassupError(`--me: «${me}» no es una sesión.`, `--me: «${me}» is not a session.`);
  if (!memoria || memoria === true) throw new WassupError('Falta --memoria <carpeta> (la que tiene retomar.md).', '--memoria <folder> is missing (the one with retomar.md).');
  const dir = path.resolve(String(memoria));
  const retomar = path.join(dir, 'retomar.md');
  if (!fs.existsSync(retomar))
    throw new WassupError(
      'No compacto: falta retomar.md en la memoria. Escríbelo (dónde se quedó el trabajo y el siguiente paso) y vuelve a lanzarlo.',
      'Not compacting: retomar.md is missing from the memory. Write it (where the work stopped and the next step) and run this again.',
    );
  const edadMin = Math.floor((now.getTime() - fs.statSync(retomar).mtimeMs) / 60000);
  if (edadMin > COMPACTAR_MAX_MIN)
    throw new WassupError(
      `No compacto: retomar.md tiene ${edadMin} min (como mucho ${COMPACTAR_MAX_MIN}). Reescríbelo entero con el estado de ahora.`,
      `Not compacting: retomar.md is ${edadMin} min old (${COMPACTAR_MAX_MIN} at most). Rewrite it whole with the current state.`,
    );
  // Sin repo (o fuera de uno), basta con la fecha.
  const commit = repo ? gitShortHead(String(repo)) : null;
  if (commit && !citaCommit(read(retomar), commit))
    throw new WassupError(
      `No compacto: retomar.md no cita el commit actual del repo (${commit}). Añádelo para que la sesión nueva sepa desde dónde sigue.`,
      `Not compacting: retomar.md does not quote the repo's current commit (${commit}). Add it so the new session knows where to go on from.`,
    );
  const b = barrer({ carpeta: dir });
  const secretos = b.hallazgos.filter((h) => h.nivel === 'secreto');
  if (secretos.length)
    throw new WassupError(
      `No compacto: hay un secreto en la memoria (${secretos.map((h) => dondeTexto(h, 'es')).join('; ')}). Quítalo; la memoria no guarda secretos.`,
      `Not compacting: there is a secret in the memory (${secretos.map((h) => dondeTexto(h, 'en')).join('; ')}). Remove it; the memory keeps no secrets.`,
    );
  const avisos = b.hallazgos.filter((h) => h.nivel === 'dato');
  const desde = now.toISOString();
  // Sin rutas: la carpeta compartida no guarda nombres de usuario del equipo.
  writeAtomic(compactandoFile(root, me), JSON.stringify({ desde, commit }, null, 2) + '\n');
  const to = avisoCompactar(cfg, me);
  let n = null;
  if (to) {
    const es = cfg.lang === 'es';
    const body = es
      ? `Compacto el contexto al cerrar un bloque. retomar.md de ${edadMin} min${commit ? `, cita el commit ${commit}` : ''}. Memoria barrida (M51): ${b.ficheros} ficheros, 0 secretos, ${avisos.length} datos personales. Aviso con «w retomado» al volver.`
      : `Compacting the context at the end of a block. retomar.md ${edadMin} min old${commit ? `, quotes commit ${commit}` : ''}. Memory swept (M51): ${b.ficheros} files, 0 secrets, ${avisos.length} personal data. I will say so with «w retomado» when back.`;
    n = send({ root, from: me, to, subject: es ? 'compactando' : 'compacting', body, expect: es ? 'nada' : 'nothing', now }).n;
  }
  return { desde, commit, edadMin, ficheros: b.ficheros, avisos, n };
}

/** M64: cierra «compactando» y avisa de lo que ha tardado. Sin marca, no hace nada. */
export function retomado({ root, me, now = new Date() }) {
  const cfg = loadConfig(root);
  if (!cfg.sessions.includes(me)) throw new WassupError(`--me: «${me}» no es una sesión.`, `--me: «${me}» is not a session.`);
  // 0.12 (A7): al retomar, la red de esta máquina al día (la IP puede haber cambiado tras un reinicio).
  try {
    red({ root, me });
  } catch {
    /* sin red legible */
  }
  const c = compactandoDe(root, me);
  if (!c) return { habia: false };
  const min = Math.max(0, Math.floor((now.getTime() - new Date(c.desde).getTime()) / 60000));
  fs.rmSync(compactandoFile(root, me), { force: true });
  const to = avisoCompactar(cfg, me);
  let n = null;
  if (to) {
    const es = cfg.lang === 'es';
    const body = es ? `Retomado tras ${min} min compactando.` : `Resumed after ${min} min compacting.`;
    n = send({ root, from: me, to, subject: es ? 'retomado' : 'resumed', body, expect: es ? 'nada' : 'nothing', now }).n;
  }
  return { habia: true, min, n };
}

// ---------- 0.12 · versión en el buzón (A6) ----------
/**
 * «Wassup: <versión>» en MI buzón: lo pone init y lo pone al día cada send. Así `health`, `send` y `status` ven si
 * en la misma carpeta conviven versiones distintas (dos versiones no ven sus cerrojos ni comparten las mismas
 * reglas: «una protección solo protege si todas tienen la misma versión»). Un buzón sin la línea es de ≤ 0.11.
 */
const RE_VERSION = /^Wassup: (\S+)$/m;
export const versionOf = (text) => (String(text ?? '').match(RE_VERSION) ?? [])[1] ?? null;
/** El texto de un buzón con la línea de versión puesta (o al día). */
function conVersion(text) {
  if (versionOf(text) === VERSION) return text;
  const line = `Wassup: ${VERSION}`;
  return RE_VERSION.test(text) ? text.replace(RE_VERSION, line) : text.replace(/^(# .+\n.+\n)/, `$1${line}\n`);
}
/** Las sesiones cuyo buzón dice otra versión (o ninguna) que la mía: [{ sesion, version }]. */
export function versionesMezcladas(root, me) {
  const cfg = loadConfig(root);
  const out = [];
  for (const s of cfg.sessions) {
    if (s === me) continue;
    const f = mailboxFile(root, cfg, s);
    if (!fs.existsSync(f)) continue;
    const v = versionOf(read(f));
    if (v !== VERSION) out.push({ sesion: s, version: v });
  }
  return out;
}
/**
 * En `send`, el aviso de versiones mezcladas sale UNA vez al día por sesión (y otra vez si cambia la mezcla), no en
 * cada envío: durante una transición sería ruido (revisión de QA y orden del coordinador). `health` y `status`
 * lo siguen diciendo siempre. La marca es un fichero propio: `aviso-version-<yo>.json`.
 */
export function versionesParaAvisar(root, me, now = new Date()) {
  const l = versionesMezcladas(root, me);
  if (!l.length) return [];
  const f = path.join(root, `aviso-version-${me}.json`);
  const hoy = stamp(now).slice(0, 10);
  const firma = l.map((x) => `${x.sesion}=${x.version ?? '-'}`).join(',');
  try {
    const m = JSON.parse(read(f));
    if (m.fecha === hoy && m.firma === firma) return [];
  } catch {
    /* sin marca */
  }
  writeAtomic(f, JSON.stringify({ fecha: hoy, firma }) + '\n');
  return l;
}
export const textoVersiones = (l, es) =>
  l.length
    ? (es ? `versiones distintas en esta carpeta (yo: ${VERSION}): ` : `different versions in this folder (me: ${VERSION}): `) +
      l.map((x) => `${x.sesion} ${x.version ?? (es ? '≤ 0.11' : '≤ 0.11')}`).join(', ') +
      (es ? ' · los cerrojos y avisos solo valen si todas tienen la misma' : ' · locks and notices only work if all have the same one')
    : null;

// ---------- 0.12 · red y apagados (A7, A8) ----------
/**
 * «Red: <IPv4 privada> · <hora con zona> · <estado>» en MI buzón. La IP y la hora las saca Wassup sola, del
 * sistema (nunca se escriben a mano). Solo la IPv4 PRIVADA (10/8, 172.16/12, 192.168/16): la de casa u oficina,
 * nunca la pública. `init` y `retomado` la ponen al día solas; `red --apago HH:MM` avisa de un apagado previsto.
 * Se puede apagar en el proyecto: `config --red off`.
 */
const RE_RED = /^(?:Red|Network): (.+)$/m;
const PRIVADA = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
// Interfaces virtuales (máquinas virtuales, contenedores, VPN): su IP no es la de la red de casa (MEDIA 7a).
const VIRTUAL = /vethernet|hyper-v|wsl|docker|^br-|virbr|vmnet|vbox|virtualbox|^utun|^tun|^tap|^wg|tailscale|zerotier|^zt|colima|lima|bridge/i;
export function ipPrivada(ifaces = os.networkInterfaces()) {
  const cand = [];
  for (const [nombre, list] of Object.entries(ifaces ?? {}))
    for (const x of list ?? [])
      if ((x.family === 'IPv4' || x.family === 4) && !x.internal && PRIVADA.test(x.address)) cand.push({ nombre, ip: x.address, virtual: VIRTUAL.test(nombre) });
  // Primero las físicas; y entre ellas, la de 192.168 (la red de casa típica) antes que 10/172.
  cand.sort((a, b) => a.virtual - b.virtual || (b.ip.startsWith('192.168.') - a.ip.startsWith('192.168.')));
  return cand[0]?.ip ?? null;
}
export function redOf(text) {
  const m = String(text ?? '').match(RE_RED);
  if (!m) return null;
  const [ip, ts, ...resto] = m[1].split(' · ');
  return { ip: ip === '?' ? null : ip, ts: ts ?? null, estado: resto.join(' · ') || null };
}
export function red({ root, me, apago, now = new Date(), ip = ipPrivada() }) {
  const cfg = loadConfig(root);
  if (!cfg.sessions.includes(me)) throw new WassupError(`--me: «${me}» no es una sesión.`, `--me: «${me}» is not a session.`);
  // Apagada por defecto (la IP privada no va a la carpeta compartida, que puede estar en la nube): `config --red on`.
  if (cfg.red !== true) return { apagada: true };
  const es = cfg.lang === 'es';
  if (apago !== undefined && apago !== true && !/^\d{1,2}:\d{2}$/.test(String(apago)))
    throw new WassupError('--apago: HH:MM (hora local).', '--apago: HH:MM (local time).');
  const estado = apago && apago !== true ? (es ? `se apaga a las ${apago}` : `shutting down at ${apago}`) : es ? 'encendido' : 'on';
  const f = mailboxFile(root, cfg, me);
  const text = read(f);
  const line = `${cfg.t.network}: ${ip ?? '?'} · ${stamp(now)} · ${estado}`;
  writeAtomic(f, RE_RED.test(text) ? text.replace(RE_RED, line) : text.replace(/^(# .+\n.+\n)/, `$1${line}\n`));
  return { ip, ts: stamp(now), estado };
}
/** Latido (A8): minutos sin noticias de una sesión (su red, su último mensaje o su salud, lo más reciente). */
export const LATIDO_DEFAULT_MIN = 240;
export function minutosSinNoticias({ red: r, lastDate, healthTs }, now = new Date()) {
  const ts = [parseStamp(r?.ts), parseStamp(lastDate), healthTs ? new Date(healthTs) : null].filter((d) => d && !Number.isNaN(d.getTime()));
  if (!ts.length) return null;
  return Math.floor((now.getTime() - Math.max(...ts.map((d) => d.getTime()))) / 60000);
}

// ---------- 0.12 · decisiones (A1) ----------
/** Un mensaje cuyo asunto empieza por «decision:» / «decisión:» lleva una decisión de la titular (cita literal). */
export const esDecision = (subject) => /^\s*decisi[oó]n\s*:/i.test(String(subject ?? ''));

// ---------- 0.12 · huellas de una carpeta de entrega (A5) ----------
/**
 * `huellas <carpeta>`: si no hay HUELLAS.txt, lo escribe (sha256 de cada fichero, recursivo, sin .git ni
 * node_modules). Si lo hay, COMPRUEBA: distintos, que faltan y nuevos. Nunca lo reescribe solo: si algo no
 * coincide, lo dice (código 1) y para volver a sellar hace falta `--sellar` (si no, un cambio no deseado
 * quedaría tapado).
 */
export const FICHERO_HUELLAS = 'HUELLAS.txt';
function listarFicheros(dir, base = dir, out = [], enlaces = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    const rel = path.relative(base, p).split(path.sep).join('/');
    if (e.isSymbolicLink()) enlaces.push(rel); // no se siguen; se cuentan y se dice
    else if (e.isDirectory()) listarFicheros(p, base, out, enlaces);
    else if (e.isFile() && !(dir === base && e.name === FICHERO_HUELLAS)) out.push(rel);
  }
  return out.sort();
}
/** sha256 por bloques de 1 MB: un fichero de cientos de MB no se carga entero en memoria (MEDIA 4). */
function sha256Fichero(f) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(f, 'r');
  const buf = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}
export function huellas({ carpeta, sellar = false }) {
  if (!carpeta || carpeta === true || !fs.existsSync(String(carpeta)) || !fs.statSync(String(carpeta)).isDirectory())
    throw new WassupError('huellas <carpeta>: tiene que ser una carpeta que exista.', 'huellas <folder>: it must be an existing folder.');
  const dir = path.resolve(String(carpeta));
  const fh = path.join(dir, FICHERO_HUELLAS);
  const enlaces = [];
  const actuales = Object.fromEntries(listarFicheros(dir, dir, [], enlaces).map((r) => [r, sha256Fichero(path.join(dir, r))]));
  if (!fs.existsSync(fh) || sellar) {
    const lineas = Object.entries(actuales).map(([r, h]) => `${h} *${r}`);
    writeAtomic(fh, lineas.join('\n') + '\n');
    return { modo: 'sellado', ficheros: lineas.length, fichero: fh, enlaces };
  }
  const guardadas = {};
  const fuera = [];
  for (const l of read(fh).split('\n')) {
    // El nombre no se recorta (puede acabar en espacio); solo el retorno de carro.
    const m = /^([0-9a-f]{64}) \*?(.+?)\r?$/.exec(l);
    if (!m) continue;
    // Rutas fuera de la carpeta («../…»): no se comprueban aquí; se dicen aparte (no son «faltan»).
    if (m[2].split('/').includes('..') || path.isAbsolute(m[2])) fuera.push(m[2]);
    else guardadas[m[2]] = m[1];
  }
  const distintos = Object.keys(guardadas).filter((r) => r in actuales && actuales[r] !== guardadas[r]);
  const faltan = Object.keys(guardadas).filter((r) => !(r in actuales));
  const nuevos = Object.keys(actuales).filter((r) => !(r in guardadas));
  return { modo: 'comprobado', ficheros: Object.keys(guardadas).length, distintos, faltan, nuevos, fuera, enlaces, ok: !distintos.length && !faltan.length && !nuevos.length };
}

// ---------- 0.12 · avisos conocidos (A18) ----------
/**
 * AVISOS.md en la carpeta compartida: lo que se sabe que NO hay que hacer (un ajuste que rompe una herramienta,
 * un truco que falló). Lo escribe la coordinadora (un escritor); las demás proponen por el buzón. `health` enseña
 * las líneas nuevas desde la última vez que esa sesión las vio. Una línea por aviso, empezando por «- ».
 */
export const FICHERO_AVISOS = 'AVISOS.md';
export function avisosNuevos(root, vistos = 0) {
  const f = path.join(root, FICHERO_AVISOS);
  if (!fs.existsSync(f)) return { total: 0, nuevos: [] };
  const l = read(f).split('\n').filter((x) => /^\s*[-*] /.test(x)).map((x) => x.replace(/^\s*[-*] /, '').trim());
  return { total: l.length, nuevos: l.slice(Math.min(Math.max(0, vistos), l.length)) };
}

/** «compactando» más de 30 min sin `retomado`: lo ve la coordinadora (todas) y cada sesión (la suya). */
function compactarReminders({ root, cfg, me, now, given }) {
  const coord = cfg.coordinator ?? cfg.sessions[0];
  const out = [];
  for (const x of cfg.sessions) {
    if (x !== me && me !== coord) continue;
    const c = compactandoDe(root, x);
    if (!c?.desde) continue;
    const min = Math.floor((now.getTime() - new Date(c.desde).getTime()) / 60000);
    const key = `compactando:${x}@${c.desde}`;
    if (min <= COMPACTAR_MAX_MIN || given[key]) continue;
    const f = mailboxFile(root, cfg, x);
    out.push({ kind: 'compactando', key, to: x, agent: fs.existsSync(f) ? agentOf(read(f)) : null, min });
  }
  return out;
}

/** M51 al leer: los hallazgos de un fichero ya escrito, con su ruta tal cual, sin el valor. */
function hallazgosDe(file) {
  if (!fs.existsSync(file)) return [];
  return detectar(read(file)).map((h) => ({ fichero: file, ...h }));
}

/** Número del mensaje del buzón al que pertenece cada línea (0 = cabecera). */
function mensajeDeLinea(text) {
  const heads = [];
  text.split('\n').forEach((l, i) => {
    const m = /^## #(\d+) · /.exec(l);
    if (m) heads.push({ linea: i + 1, n: Number(m[1]) });
  });
  return (linea) => heads.filter((h) => h.linea <= linea).pop()?.n ?? 0;
}

export function send({ root, from, to, subject, body, expect, commit, now, re, campoCuerpo = '--body', comprobarPrueba = false }) {
  const cfg = loadConfig(root);
  const t = cfg.t;
  if (!cfg.sessions.includes(from)) throw new WassupError(`--from: «${from}» no es una sesión (ejecuta «init»).`, `--from: «${from}» is not a session (run «init»).`);
  if (!subject?.trim()) throw new WassupError('Falta --subject.', '--subject is required.');
  if (!body?.trim()) throw new WassupError('Falta --body o --body-file.', '--body or --body-file is required.');
  // M51: un secreto bloquea el envío entero; un DNI/NIE o un IBAN válido solo avisa.
  const avisos = comprobarSalida({ '--subject': subject, [campoCuerpo]: body, '--expect': expect ?? '' });
  // M67: lo que escribe una sesión (no los avisos automáticos de Wassup) y dice «hecho» lleva «Prueba:».
  let avisoPrueba = null;
  const modoPrueba = PRUEBA_MODOS.includes(cfg.prueba) ? cfg.prueba : 'aviso';
  if (comprobarPrueba && modoPrueba !== 'off') {
    const fp = faltaPrueba(`${subject}\n${body}`);
    if (fp.falta && modoPrueba === 'estricta')
      throw new WassupError(
        `Bloqueado (prueba estricta): el mensaje dice «${fp.palabras.join('», «')}» y no tiene una línea «Prueba:» con lo que lo demuestra.`,
        `Blocked (strict proof): the message says «${fp.palabras.join('», «')}» and has no «Proof:» line showing it.`,
      );
    if (fp.falta) avisoPrueba = fp.palabras;
  }
  const targets = String(to ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!targets.length) throw new WassupError('Falta --to (una sesión, varias separadas por comas, o all).', '--to is required (a session, several separated by commas, or all).');
  for (const x of targets) {
    if (!ALL.has(x) && !cfg.sessions.includes(x)) throw new WassupError(`--to: «${x}» no es una sesión.`, `--to: «${x}» is not a session.`);
    if (x === from) throw new WassupError('--to: una sesión no se escribe a sí misma.', '--to: a session does not write to itself.');
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
  // M30: each number must be a message of a recipient addressed to me (or to all); its subject is returned.
  const reSubjects = [];
  if (reNums.length) {
    const named = targets.filter((x) => !ALL.has(x));
    const pool = (named.length ? named : cfg.sessions.filter((x) => x !== from)).flatMap((x) => {
      const f = mailboxFile(root, cfg, x);
      return fs.existsSync(f) ? parseMailbox(read(f)).filter((m) => addressedTo(m, from)).map((m) => ({ ...m, box: x })) : [];
    });
    for (const k of reNums) {
      const m = pool.find((x) => x.n === k);
      if (!m)
        throw new WassupError(
          `--re: #${k} no es un mensaje que te hayan escrito ${named.join(', ') || 'las demás'}.`,
          `--re: #${k} is not a message ${named.join(', ') || 'the others'} wrote to you.`,
        );
      reSubjects.push({ n: k, from: m.box, subject: m.subject });
    }
  }
  const reLine = reNums.length ? `**${t.reply}:** ${reNums.map((x) => `#${x}`).join(', ')}\n` : '';
  const msg =
    `\n${head}\n**${t.subject}:** ${subject.trim()}\n${reLine}\n${body.trim()}\n` +
    (expect?.trim() ? `\n**${t.expect}:** ${expect.trim()}\n` : '') +
    '\n---\n';
  // M29: answering #N of a single recipient also marks it (and what came before) as read, in MY mailbox.
  let base = text;
  const solo = targets.filter((x) => !ALL.has(x));
  if (reNums.length && solo.length === 1) {
    const acks = parseAcks(text);
    delete acks['—'];
    const hasta = Math.max(...reNums);
    if ((acks[solo[0]] ?? 0) < hasta) {
      acks[solo[0]] = hasta;
      base = setAcks(text, cfg, acks);
    }
  }
  // 0.12 (A6): la línea de versión, al día con cada envío.
  writeAtomic(file, conVersion(base).replace(/\s*$/, '\n') + msg);
  return { n, file, subject: subject.trim(), reSubjects, avisos, avisoPrueba, versiones: versionesParaAvisar(root, from, now ?? new Date()), decision: esDecision(subject) };
}

/** Unread messages addressed to «me» (or to all), per sender, after my «Read up to». */
export function unread({ root, me }) {
  const cfg = loadConfig(root);
  if (!cfg.sessions.includes(me))
    throw new WassupError(`La sesión «${me}» no está registrada (la registra el coordinador).`, `Session «${me}» is not registered (the coordinator registers it).`);
  // B-12x: registrada pero sin «init» todavía: su buzón no existe, se lee como vacío (nada leído aún).
  const fm = mailboxFile(root, cfg, me);
  const mine = fs.existsSync(fm) ? read(fm) : '';
  const acks = parseAcks(mine);
  const result = [];
  for (const other of cfg.sessions) {
    if (other === me) continue;
    const f = mailboxFile(root, cfg, other);
    if (!fs.existsSync(f)) continue;
    const upto = acks[other] ?? 0;
    const text = read(f);
    const msgs = parseMailbox(text).filter(
      (m) => m.n > upto && m.to.some((x) => x === me || ALL.has(x)),
    );
    if (!msgs.length) continue;
    // M51 al leer: lo que ya está escrito en esos mensajes (fichero y línea, sin el valor).
    const nums = new Set(msgs.map((m) => m.n));
    const deLinea = mensajeDeLinea(text);
    const avisos = detectar(text)
      .map((h) => ({ fichero: f, n: deLinea(h.linea), ...h }))
      .filter((h) => nums.has(h.n));
    result.push({ from: other, upto, messages: msgs, avisos });
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
    if (!cfg.sessions.includes(from)) throw new WassupError(`--from: «${from}» no es una sesión.`, `--from: «${from}» is not a session.`);
    const n = Number(upto);
    if (!Number.isInteger(n) || n < 0) throw new WassupError('--upto: un número de mensaje.', '--upto: a message number.');
    acks[from] = n;
  }
  writeAtomic(file, setAcks(text, cfg, acks));
  return acks;
}

/** One message of a session's mailbox, whole (M27: without awk). */
export function show({ root, de, num }) {
  const cfg = loadConfig(root);
  if (!cfg.sessions.includes(de)) throw new WassupError(`--de: «${de}» no es una sesión.`, `--de: «${de}» is not a session.`);
  const n = Number(num);
  const m = parseMailbox(read(mailboxFile(root, cfg, de))).find((x) => x.n === n);
  if (!m) throw new WassupError(`No hay #${num} en el buzón de ${de}.`, `There is no #${num} in ${de}'s mailbox.`);
  return { ...m, from: de };
}

/**
 * Messages already read by «me» that expect an answer and still have none from me (M28): after an `ack`,
 * so that nothing asked is forgotten just because it was marked as read.
 */
export function pendingAnswers({ root, me }) {
  const cfg = loadConfig(root);
  const boxes = allMailboxes(root, cfg);
  const acks = boxes[me]?.acks ?? {};
  const out = [];
  for (const other of cfg.sessions) {
    if (other === me) continue;
    for (const m of boxes[other].messages)
      if (m.expect && m.n <= (acks[other] ?? 0) && addressedTo(m, me) && isPending(boxes, other, m, me))
        out.push({ from: other, n: m.n, subject: m.subject, expect: m.expect });
  }
  return out;
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
      maquina: text ? maquinaOf(text) : null,
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
      // 0.12: versión (A6), red (A7) y minutos sin noticias (A8, latido).
      version: text ? versionOf(text) : null,
      red: text && cfg.red === true ? redOf(text) : null,
      sinNoticiasMin: minutosSinNoticias({ red: text && cfg.red === true ? redOf(text) : null, lastDate: msgs.length ? msgs[msgs.length - 1].date : null, healthTs: h?.ts ?? null }),
      compactandoDesde: compactandoDe(root, s)?.desde ?? null,
      lastMessage: msgs.length ? msgs[msgs.length - 1].n : 0,
      lastDate: msgs.length ? msgs[msgs.length - 1].date : null,
      unread: unread({ root, me: s }).reduce((k, u) => k + u.messages.length, 0),
      // M51 al leer: su buzón y su ESTADO, con fichero y línea, nunca el valor.
      avisos: [...hallazgosDe(f), ...hallazgosDe(path.join(root, `${cfg.t.status}-${s}.md`))],
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
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?:\s*([+-])(\d{2}):?(\d{2}))?/.exec(s ?? '');
  if (iso && iso[6]) {
    const off = (iso[6] === '-' ? -1 : 1) * (+iso[7] * 60 + +iso[8]);
    return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5]) - off * 60000);
  }
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
  if (!cfg.sessions.includes(me)) throw new WassupError(`--me: «${me}» no es una sesión.`, `--me: «${me}» is not a session.`);
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
  out.push(...compactarReminders({ root, cfg, me, now, given }));
  return out;
}

/**
 * Notes that notice `level` for `<to>#<n>` was given (in reminders-<me>.json: only I write it). Entries
 * that are no longer pending are dropped, so the file never grows.
 */
export function markReminded({ root, me, key, level }) {
  const cfg = loadConfig(root);
  // Resource reminders (M22) and M64 are noted by their key («libre:<x>@<since>», «deseq:<x>@<ts>»,
  // «compactando:<x>@<since>»), once.
  if (/^(?:libre|deseq|compactando):[a-z0-9_-]+@/.test(String(key ?? ''))) {
    const given = loadReminded(root, me);
    given[String(key)] = 1;
    const now = Date.now();
    for (const k of Object.keys(given)) {
      const at = /^(?:libre|deseq|compactando):[^@]+@(.+)$/.exec(k)?.[1];
      if (at && now - new Date(at).getTime() > 7 * 24 * 3600 * 1000) delete given[k];
    }
    writeAtomic(remindFile(root, me), JSON.stringify(given, null, 2) + '\n');
    return given;
  }
  const [to, n] = String(key ?? '').split('#');
  if (!cfg.sessions.includes(to) || !Number.isInteger(Number(n))) throw new WassupError('--mark: <sesión>#<número>.', '--mark: <session>#<number>.');
  const k = Number(level);
  if (![1, 2, 3].includes(k)) throw new WassupError('--level: 1, 2 o 3.', '--level: 1, 2 or 3.');
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
  if (!cfg.sessions.includes(me)) throw new WassupError(`--me: «${me}» no es una sesión.`, `--me: «${me}» is not a session.`);
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
export function configure({ root, by, mode, base, max, assistMin, assistOwn, assistCooldown, recursos = {}, incidents, maintainer, errorReports, prueba, red: redCfg, latido }) {
  const cfgFile = path.join(root, 'wassup.json');
  const cfg = loadConfig(root);
  const coordinator = cfg.coordinator ?? cfg.sessions[0];
  if (!by || by === true) throw new WassupError(`Falta --by <coordinadora> (la coordinadora es «${coordinator}»).`, `--by <coordinator> is missing (the coordinator is «${coordinator}»).`);
  if (by !== coordinator) throw new WassupError(`Solo la coordinadora (${coordinator}) cambia wassup.json.`, `Only the coordinator (${coordinator}) changes wassup.json.`);
  const { t: _t, ...plain } = cfg;
  const r = { ...remindConfig(cfg) };
  if (mode !== undefined) {
    if (!['escalate', 'auto'].includes(mode)) throw new WassupError('--mode: escalate o auto.', '--mode: escalate or auto.');
    r.mode = mode;
  }
  for (const [k, v] of [['baseMin', base], ['maxMin', max]]) {
    if (v === undefined) continue;
    const x = Number(v);
    if (!Number.isInteger(x) || x < 1) throw new WassupError(`--${k === 'baseMin' ? 'base' : 'max'}: minutos enteros.`, `--${k === 'baseMin' ? 'base' : 'max'}: whole minutes.`);
    r[k] = x;
  }
  if (r.maxMin < r.baseMin) throw new WassupError('--max no puede ser menor que --base.', '--max cannot be lower than --base.');
  plain.reminders = r;
  const ac = { ...assistConfig(cfg) };
  for (const [k, v, flag] of [
    ['minLoad', assistMin, 'assist-min'],
    ['ownMax', assistOwn, 'assist-own'],
    ['cooldownMin', assistCooldown, 'assist-cooldown'],
  ]) {
    if (v === undefined) continue;
    const x = Number(v);
    if (!Number.isInteger(x) || x < 0) throw new WassupError(`--${flag}: un número entero.`, `--${flag}: a whole number.`);
    ac[k] = x;
  }
  plain.assist = ac;
  const rs = { ...resourcesConfig(cfg) };
  for (const [k, v] of Object.entries(recursos)) {
    if (v === undefined) continue;
    const x = Number(v);
    if (!(k in RESOURCES_DEFAULTS) || !Number.isFinite(x) || x < 0) throw new WassupError(`recursos.${k}: un número ≥ 0.`, `recursos.${k}: a number ≥ 0.`);
    rs[k] = x;
  }
  plain.recursos = rs;
  if (incidents !== undefined) {
    if (!['on', 'off', true, false].includes(incidents)) throw new WassupError('--incidents: on u off.', '--incidents: on or off.');
    plain.incidencias = incidents === 'on' || incidents === true;
  }
  // M25: la sesión que mantiene Wassup y el opt-in para mandarle los errores (saneados).
  if (maintainer !== undefined && maintainer !== true) {
    if (!plain.sessions.includes(String(maintainer))) throw new WassupError(`--maintainer: «${maintainer}» no es una sesión.`, `--maintainer: «${maintainer}» is not a session.`);
    plain.mantenedora = String(maintainer);
  }
  if (errorReports !== undefined) {
    if (!['on', 'off', true, false].includes(errorReports)) throw new WassupError('--error-reports: on u off.', '--error-reports: on or off.');
    plain.avisoErrores = errorReports === 'on' || errorReports === true;
  }
  // M67: aviso (por defecto), estricta (bloquea el envío) u off.
  if (prueba !== undefined && prueba !== true) {
    if (!PRUEBA_MODOS.includes(String(prueba))) throw new WassupError('--prueba: aviso, estricta u off.', '--prueba: aviso, estricta or off.');
    plain.prueba = String(prueba);
  }
  // 0.12 (A7/A8): la línea de red en los buzones (on por defecto) y los minutos del latido.
  if (redCfg !== undefined) {
    if (!['on', 'off', true, false].includes(redCfg)) throw new WassupError('--red: on u off.', '--red: on or off.');
    plain.red = redCfg === 'on' || redCfg === true;
  }
  if (latido !== undefined && latido !== true) {
    const x = Number(latido);
    if (!Number.isInteger(x) || x < 5) throw new WassupError('--latido: minutos enteros (5 o más).', '--latido: whole minutes (5 or more).');
    plain.latidoMin = x;
  }
  writeAtomic(cfgFile, JSON.stringify(plain, null, 2) + '\n');
  return { ...r, assist: ac, recursos: rs, incidencias: plain.incidencias === true, mantenedora: plain.mantenedora ?? null, avisoErrores: plain.avisoErrores === true, prueba: PRUEBA_MODOS.includes(plain.prueba) ? plain.prueba : 'aviso', red: plain.red === true, latidoMin: plain.latidoMin ?? LATIDO_DEFAULT_MIN };
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
  if (!cfg.sessions.includes(me)) throw new WassupError(`--me: «${me}» no es una sesión.`, `--me: «${me}» is not a session.`);
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
  if (!cfg.sessions.includes(to) || to === me) throw new WassupError('--mark: otra sesión.', '--mark: another session.');
  const f = assistFile(root, me);
  const last = fs.existsSync(f) ? JSON.parse(read(f)) : {};
  last[to] = now.toISOString();
  writeAtomic(f, JSON.stringify(last, null, 2) + '\n');
  return last;
}

// ---------- capabilities (M21) ----------
/**
 * «Capabilities: playwright, safari, cred:demo-deploy, ram:16» in MY mailbox (one writer): what my machine
 * CAN do. Never secrets: «cred:x» says that I hold the credentials for x, not what they are.
 */
/**
 * B-1: las capacidades son nombres (playwright, safari, cred:<proyecto>), nunca secretos. «cred:» lleva SOLO el
 * nombre del proyecto: nada que parezca una clave, un token o una contraseña, y nada que el filtro M51 marque.
 */
export function validarCaps(caps) {
  for (const c of String(caps).split(',').map((s) => s.trim()).filter(Boolean)) {
    const [tipo, valor] = c.includes(':') ? [c.slice(0, c.indexOf(':')), c.slice(c.indexOf(':') + 1)] : [c, ''];
    const malo =
      detectar(c).length > 0 ||
      !/^[a-z0-9][a-z0-9._-]{0,39}$/i.test(tipo) ||
      (c.includes(':') && (tipo.toLowerCase() !== 'cred' || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(valor))) ||
      (tipo.toLowerCase() === 'cred' && /clave|key|pass|pwd|token|secret|contrase|credencial|[0-9]{3,}/i.test(valor));
    if (malo)
      throw new WassupError(
        `--caps: «${c.split(':')[0]}…» no vale. Solo nombres (playwright, safari) y «cred:<proyecto>» con el NOMBRE del proyecto, nunca una clave, un token ni una contraseña.`,
        `--caps: «${c.split(':')[0]}…» is not valid. Only names (playwright, safari) and «cred:<project>» with the project NAME, never a key, a token or a password.`,
      );
  }
}

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
  // The decimal mark follows the system language: «1536.00M» or «1568,25M».
  const m = /used = ([\d.,]+)([MG])/.exec(text ?? '');
  if (!m) return null;
  const x = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(x)) return null;
  return Math.round((m[2] === 'G' ? x : x / 1024) * 10) / 10;
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
export async function measure({ root, repo = process.cwd(), platform = process.platform, run = runner, osm, env = process.env, maquina = null }) {
  osm = osm ?? (await import('node:os')).default;
  const s = {
    so: `${platform} ${osm.release()}`,
    nucleos: osm.cpus().length || 1,
    ramTotalGB: gb(osm.totalmem()),
    ramGB: null,
    swapGB: null,
    carga: 0,
    repoGB: diskFreeGB(repo),
    repoNombre: path.basename(repo),
    compartidaGB: diskFreeGB(root),
    termica: { estado: 'desconocida', limiteVelocidadPct: null, fuente: null },
    vmMemGB: null,
    // M69: la máquina declarada en init (nunca os.hostname()); sin ella, «sin-maquina».
    equipoId: crypto.createHash('sha256').update(maquina || 'sin-maquina').digest('hex').slice(0, 8),
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
  // M32: de dónde viene la carga, por categorías (nunca los nombres de los procesos).
  if (platform === 'darwin' || platform === 'linux') {
    const ps = tryRun('ps', ['-Ao', '%cpu=,comm='], 3000);
    s.origenCarga = ps ? origenDeCarga(parsePs(ps)) : null;
  } else s.origenCarga = null;
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
  if (!cfg.sessions.includes(me)) throw new WassupError(`--me: «${me}» no es una sesión.`, `--me: «${me}» is not a session.`);
  const rec = resourcesConfig(cfg);
  const coordinator = cfg.coordinator ?? cfg.sessions[0];
  const prev = loadHealth(root, cfg, me);
  const s = sample ?? (await measure({ root, repo, maquina: maquinaDe(root, me) }));
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
    origenCarga: s.origenCarga ?? null,
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
  // 0.12 (A18): avisos conocidos nuevos desde la última vez; (A6) versiones mezcladas en la carpeta.
  const av = avisosNuevos(root, prev?.avisosVistos ?? 0);
  out.avisosVistos = av.total;
  writeAtomic(healthFile(root, cfg, me), JSON.stringify(out, null, 2) + '\n');
  // El nombre de la carpeta del repo solo sale por pantalla: en el fichero compartido podría delatar al usuario.
  return { ...out, code: HEALTH_CODE[estado], sent, repoNombre: s.repoNombre ?? null, avisosNuevos: av.nuevos, versiones: versionesMezcladas(root, me) };
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

/** Token and key shapes (shared by `scrub` and the secrets hook). */
export const TOKEN_PATTERNS = [
  /\b(?:sk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs]|AIza|ya29|AKIA)[-_A-Za-z0-9.]{8,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g,
  /\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{32,}={0,2}/g,
];
/** Passwords and private keys: «password: x», «clave=x», PEM blocks. */
export const PASSWORD_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:pass(?:word|wd)?|contrase(?:ñ|n)a|clave|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"']{6,}/i,
];

/** Kinds of secret found in a text (empty list = clean). Never returns the secret itself. */
export function findSecrets(text) {
  const t = String(text ?? '');
  const out = [];
  if (TOKEN_PATTERNS.some((re) => new RegExp(re.source, re.flags).test(t))) out.push('token');
  if (PASSWORD_PATTERNS.some((re) => re.test(t))) out.push('password');
  return out;
}

/**
 * Removes what must never travel: e-mails, phone numbers, tokens and keys, absolute paths and URL
 * paths/queries (the host stays). One line, 300 characters at most.
 */
export function scrub(text) {
  return String(text ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[correo]')
    .replace(TOKEN_PATTERNS[0], '[token]')
    .replace(TOKEN_PATTERNS[1], '[token]')
    .replace(TOKEN_PATTERNS[2], '[token]')
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
  if (!cfg.sessions.includes(me)) throw new WassupError(`--me: «${me}» no es una sesión.`, `--me: «${me}» is not a session.`);
  if (cfg.incidencias !== true)
    throw new WassupError(
      cfg.lang === 'es'
        ? 'Las incidencias están apagadas en este proyecto (opt-in): las enciende la coordinadora con «config --incidents on».'
        : 'Incidents are off for this project (opt-in): the coordinator enables them with «config --incidents on».',
    );
  if (!INCIDENT_TYPES.includes(tipo)) throw new WassupError(`--tipo: uno de ${INCIDENT_TYPES.join(', ')}.`, `--tipo: one of ${INCIDENT_TYPES.join(', ')}.`);
  // M51: un secreto bloquea la incidencia (scrub lo taparía, pero no debe ni llegar a escribirse).
  const avisos = comprobarSalida({ '--texto': texto ?? '', '--cc': claudeCode && claudeCode !== true ? claudeCode : '' });
  const clean = scrub(texto);
  if (!clean) throw new WassupError('--texto: una frase que diga qué ha pasado.', '--texto: one sentence describing what happened.');
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
  // Los avisos de M51 viajan aparte (no enumerables): el formato de la entrada no cambia.
  return Object.defineProperty(entry, 'avisos', { value: avisos, enumerable: false });
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
  const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  L.push(
    h(
      `- Periodo: ${all[0]?.ts?.slice(0, 10) ?? '—'} → ${all.at(-1)?.ts?.slice(0, 10) ?? '—'} · ${pl(all.length, 'incidencia', 'incidencias')} · ${pl(sessionsWithIncidents, 'sesión', 'sesiones')}`,
      `- Period: ${all[0]?.ts?.slice(0, 10) ?? '—'} → ${all.at(-1)?.ts?.slice(0, 10) ?? '—'} · ${pl(all.length, 'incident', 'incidents')} · ${pl(sessionsWithIncidents, 'session', 'sessions')}`,
    ),
  );
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
      ? h(`- Claude Code o el modelo: ${pl(product.length, 'incidencia', 'incidencias')} de ese tipo (${[...new Set(product.map((e) => e.tipo))].join(', ')}): \`/feedback\` o \`/bug\` en Claude Code.`, `- Claude Code or the model: ${pl(product.length, 'such incident', 'such incidents')} (${[...new Set(product.map((e) => e.tipo))].join(', ')}): \`/feedback\` or \`/bug\` in Claude Code.`)
      : h('- Claude Code o el modelo: ninguna incidencia de ese tipo.', '- Claude Code or the model: no such incidents.'),
  );
  const text = L.join('\n') + '\n';
  const file = path.join(root, `${cfg.t.report}-${day}${issue ? '-issue' : ''}.md`);
  writeAtomic(file, text);
  return { file, text, total: all.length, product: product.length };
}

// ---------- command line ----------
// M32: de dónde viene la carga, por categorías y SIN nombres de procesos.
const ORIGENES = [
  ['sincronizacion', /drive|dropbox|onedrive|icloud|bird|cloudd|fileprovider|googledrivefs|syncthing/i],
  ['contenedores', /docker|com\.docker|vmmem|qemu|virtualization|colima|wsl/i],
  ['navegador', /chrome|chromium|firefox|safari|webkit|msedge|playwright/i],
  ['desarrollo', /node|npm|esbuild|vite|tsc|java|gradle|electron|python|git/i],
];
const NOMBRE_ORIGEN = {
  es: { sincronizacion: 'sincronización', contenedores: 'contenedores', navegador: 'navegador', desarrollo: 'tareas de desarrollo', sistema: 'sistema' },
  en: { sincronizacion: 'sync', contenedores: 'containers', navegador: 'browser', desarrollo: 'dev tasks', sistema: 'system' },
};
/** [{ nombre, cpu }] → [{ origen, pct }] (reparto de la CPU usada, mayor primero). Los nombres no salen. */
export function origenDeCarga(procesos) {
  const suma = {};
  let total = 0;
  for (const p of procesos) {
    const cpu = Number(p.cpu);
    if (!Number.isFinite(cpu) || cpu <= 0) continue;
    const o = ORIGENES.find(([, re]) => re.test(String(p.nombre)))?.[0] ?? 'sistema';
    suma[o] = (suma[o] ?? 0) + cpu;
    total += cpu;
  }
  if (!total) return [];
  return Object.entries(suma)
    .map(([origen, cpu]) => ({ origen, pct: Math.round((cpu / total) * 100) }))
    .filter((x) => x.pct >= 5)
    .sort((a, b) => b.pct - a.pct);
}
/** `ps -Ao %cpu=,comm=` (macOS y Linux) → [{ nombre, cpu }]. */
export function parsePs(text) {
  return String(text ?? '')
    .split('\n')
    .map((l) => /^\s*([\d.,]+)\s+(.+)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ cpu: Number(m[1].replace(',', '.')), nombre: path.basename(m[2].trim()) }));
}
export const textoOrigen = (o, lang = 'es') =>
  o.map((x) => `${(NOMBRE_ORIGEN[lang] ?? NOMBRE_ORIGEN.en)[x.origen] ?? x.origen} ${x.pct} %`).join(', ');

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
  init     --root <shared> --name <me> --maquina <machine> [--lang es|en] [--agent "<name in ListAgents>"]
           M69: --maquina is required (your own name for this machine, never a person's; Wassup never reads the
           system name) unless the mailbox already has one · its short hash is the machine id
  register --root <shared> --by <coordinator> --name <new session>
  send     --root <shared> --from <me> --to <a,b|all> --subject "…" (--body "…"|--body-file f) [--expect "…"] [--commit auto|<hash>]
  unread   --root <shared> --me <me> [--json] [--resumen]    --resumen: one line per message
  show     --root <shared> --de <session> --num <n>         print one message whole
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
  config   … [--prueba aviso|estricta|off]                    M67: send warns (or blocks, estricta) when a message says «done»
           without a «Proof:» line · labels in 7 languages, trigger words in es, en, pt, fr, it, de
  barrer   <folder> [--json]                                  M51: secrets (exit 1) and Spanish ID/IBAN (notice) in a folder,
           with file and line, never the value · send and log block secrets; unread and status point them out
  compactar --root <shared> --me <me> --memoria <folder> [--repo <folder>|none]   M64: before compacting the context,
           retomar.md ≤ 30 min (quoting the repo commit if there is a repo), memory swept (a secret refuses: exit 1),
           notice to the coordinator and mark «compactando» · remind warns after 30 min without «retomado»
  retomado --root <shared> --me <me>                         close «compactando» and tell the coordinator
  red      --root <shared> --me <me> [--apago HH:MM]           0.12: private IPv4 and time of this machine (taken from the
           system, never typed) in my mailbox; init and retomado do it alone · --apago: a planned shutdown/restart
  huellas  <folder> [--sellar] [--json]                       0.12: write HUELLAS.txt (sha256 of each file) or, if there is
           one, check it (exit 1 if anything differs; it is never rewritten without --sellar)
  config   … [--red on|off] [--latido <min>]                  0.12: network line (OFF by default); «no news» after <min> (240)
  send «decision: …» as subject marks a decision of the person in charge (literal quote): unread highlights it.
  AVISOS.md in the shared folder (written by the coordinator, one «- » line each): health shows the new ones.
  The mailbox carries «Wassup: <version>»: send, health and status warn when versions are mixed in the folder.
  --version
«Read from X up to: #N» means «reviewed up to #N», including messages that were not addressed to you.
send --re 4,6 marks the message as the answer to #4 and #6 of the recipient (stops their reminders), checks that they
exist and, with a single recipient, marks them as read. send prints the line to paste in the direct notice.
ack lists what you have read that still expects an answer from you.`;

// ---------- punto de extensión: la edición Completa ----------
/**
 * La Básica (MIT) es este fichero solo. La Completa añade `wassup-completa.mjs` a su lado: si está, se carga
 * y aporta órdenes (`comandos`), su ayuda (`AYUDA`) y ganchos (health --repo/--wait-ok/--report, el consejo
 * de awake, los cerrojos y el despierto de status, y el aviso de errores a la mantenedora). Si no está,
 * todo eso se dice con un mensaje claro, sin fallar a medias.
 */
let _completa;
export async function cargarCompleta(dir = path.dirname(fileURLToPath(import.meta.url))) {
  if (_completa !== undefined) return _completa;
  const f = path.join(dir, 'wassup-completa.mjs');
  try {
    _completa = fs.existsSync(f) ? await import(pathToFileURL(f).href) : null;
  } catch (e) {
    // I-4: la Completa explica qué núcleo necesita; aquí se pasa como error de Wassup, sin la pila de Node.
    const [es, en] = String(e?.message ?? e).split('\n');
    throw new WassupError(es, en ?? es);
  }
  return _completa;
}

/** Corta con un mensaje claro cuando se pide algo de la Completa en la Básica. */
function soloCompleta(ext, que) {
  if (ext) return undefined;
  throw new WassupError(`«${que}» es de la edición Completa de Wassup y aquí no está instalada.`, `«${que}» belongs to the Full edition of Wassup, which is not installed here.`);
}

/** Lo que la Completa necesita del núcleo y no forma parte de su interfaz pública. */
export const _interno = { read, writeAtomic, mailboxFile: (root, cfg, name) => mailboxFile(root, cfg, name) };

/** M51: una línea por hallazgo, a stderr, sin el valor. */
function imprimirAvisos(avisos, es) {
  for (const h of avisos)
    console.error(
      h.nivel === 'secreto'
        ? `${es ? 'SECRETO' : 'SECRET'} · ${dondeTexto(h, es ? 'es' : 'en')}`
        : `${es ? 'aviso' : 'notice'} · ${dondeTexto(h, es ? 'es' : 'en')}${es ? ' (dato personal: ¿hace falta?)' : ' (personal data: is it needed?)'}`,
    );
}

async function main(argv) {
  const corte = argv.indexOf('--');
  const cola = corte >= 0 ? argv.slice(corte + 1) : [];
  if (corte >= 0) argv = argv.slice(0, corte);
  const a = args(argv);
  const cmd = a._[0];
  const root = a.root ? path.resolve(String(a.root)) : null;
  const ext = await cargarCompleta();
  const ayuda = HELP + (ext?.AYUDA ?? '');
  if (a.version || cmd === 'version') return console.log(VERSION);
  if (!cmd || cmd === 'help' || a.help) return console.log(ayuda);
  if (cmd === 'barrer' || cmd === 'sweep') {
    // M51 suelto: no necesita --root (sirve para cualquier carpeta, también la memoria de M64).
    const es = (a.lang ?? idiomaDeSalida(argv)) === 'es';
    const r = barrer({ carpeta: a._[1] ?? a.carpeta });
    if (a.json) console.log(JSON.stringify(r, null, 2));
    else {
      imprimirAvisos(r.hallazgos, es);
      const sec = r.hallazgos.filter((h) => h.nivel === 'secreto').length;
      const dat = r.hallazgos.length - sec;
      console.log(
        es
          ? `${sec ? 'SECRETOS' : 'ok'} · ${r.ficheros} ficheros · ${sec} secretos · ${dat} datos personales${r.saltados ? ` · ${r.saltados} saltados (binarios o > 2 MB)` : ''}`
          : `${sec ? 'SECRETS' : 'ok'} · ${r.ficheros} files · ${sec} secrets · ${dat} personal data${r.saltados ? ` · ${r.saltados} skipped (binary or > 2 MB)` : ''}`,
      );
    }
    if (r.hallazgos.some((h) => h.nivel === 'secreto')) process.exitCode = 1;
    return;
  }
  if (cmd === 'huellas' || cmd === 'hashes') {
    // 0.12 (A5) suelto: no necesita --root. Escribe HUELLAS.txt si no hay; si hay, comprueba. --sellar: reescribe.
    const es = (a.lang ?? idiomaDeSalida(argv)) === 'es';
    const r = huellas({ carpeta: a._[1] ?? a.carpeta, sellar: !!a.sellar });
    if (a.json) return console.log(JSON.stringify(r, null, 2));
    if (r.modo === 'sellado') return console.log(es ? `ok · sellado · ${r.ficheros} ficheros → ${r.fichero}` : `ok · sealed · ${r.ficheros} files → ${r.fichero}`);
    for (const x of r.fuera ?? []) console.error(`${es ? 'fuera de la carpeta (no se comprueba aquí)' : 'outside the folder (not checked here)'} · ${x}`);
    if (r.enlaces?.length) console.error(es ? `${r.enlaces.length} enlaces simbólicos no se siguen` : `${r.enlaces.length} symbolic links are not followed`);
    for (const x of r.distintos) console.error(`${es ? 'DISTINTO' : 'CHANGED'} · ${x}`);
    for (const x of r.faltan) console.error(`${es ? 'FALTA' : 'MISSING'} · ${x}`);
    for (const x of r.nuevos) console.error(`${es ? 'NUEVO' : 'NEW'} · ${x}`);
    if (!r.ok) process.exitCode = 1;
    return console.log(
      r.ok
        ? es ? `ok · ${r.ficheros} ficheros coinciden` : `ok · ${r.ficheros} files match`
        : es ? `NO COINCIDE · ${r.distintos.length} distintos, ${r.faltan.length} faltan, ${r.nuevos.length} nuevos · HUELLAS.txt no se ha tocado (para volver a sellar: --sellar)` : `MISMATCH · ${r.distintos.length} changed, ${r.faltan.length} missing, ${r.nuevos.length} new · HUELLAS.txt untouched (to seal again: --sellar)`,
    );
  }
  if (!root) throw new WassupError('Falta --root <carpeta compartida>.', '--root <shared folder> is required.');
  if (ext?.comandos && Object.hasOwn(ext.comandos, cmd)) return ext.comandos[cmd]({ a, root, cola, argv });
  if (['awake', 'lock', 'unlock', 'run', 'turno', 'vigilar'].includes(cmd)) soloCompleta(ext, cmd);
  switch (cmd) {
    case 'init': {
      // M69: --maquina es obligatorio y explícito, salvo que el buzón ya tenga una declarada.
      if ((a.maquina === undefined || a.maquina === true) && !maquinaDe(root, a.name))
        throw new WassupError(
          'Falta --maquina <nombre>: el nombre de este equipo, el que tú elijas (p. ej., «pc-casa»), sin nombres de personas. Wassup no lee el nombre del sistema.',
          '--maquina <name> is missing: a name for this machine, your choice (e.g. «home-pc»), with no people\'s names. Wassup does not read the system name.',
        );
      const r = init({ root, name: a.name, lang: a.lang, agent: a.agent, caps: a.caps, maquina: a.maquina === true ? undefined : a.maquina });
      const tip = ext?.avisoDespierto(root, r.name, r.lang === 'es');
      if (tip) console.error(tip);
      return console.log(
        r.lang === 'es'
          ? `ok · ${r.name} · máquina: ${r.maquina} · coordinadora: ${r.coordinator} · sesiones: ${r.sessions.join(', ')}`
          : `ok · ${r.name} · machine: ${r.maquina} · coordinator: ${r.coordinator} · sessions: ${r.sessions.join(', ')}`,
      );
    }
    case 'register': {
      const r = register({ root, by: a.by, name: a.name });
      return console.log(`ok · ${loadConfig(root).lang === 'es' ? 'sesiones' : 'sessions'}: ${r.join(', ')}`);
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
      const r = send({ root, from: a.from, to: a.to, subject: a.subject, body, expect: a.expect, commit: a.commit, re: a.re, campoCuerpo: a['body-file'] ? '--body-file' : '--body', comprobarPrueba: true });
      const t = loadConfig(root).t;
      imprimirAvisos(r.avisos, loadConfig(root).lang === 'es');
      if (r.avisoPrueba)
        console.error(
          loadConfig(root).lang === 'es'
            ? `aviso · dice «${r.avisoPrueba.join('», «')}» sin una línea «Prueba:» (M67): añade con qué se comprueba`
            : `notice · says «${r.avisoPrueba.join('», «')}» with no «Proof:» line (M67): add how it was checked`,
        );
      const tv = textoVersiones(r.versiones, loadConfig(root).lang === 'es');
      if (tv) console.error(`aviso · ${tv}`);
      console.log(`ok · #${r.n} · ${r.file}`);
      for (const x of r.reSubjects) console.log(t.reAbout(x.n, x.subject));
      // M26: the exact line to paste in the direct notice, so the number quoted is the real one.
      return console.log(t.direct(a.from, r.n, r.subject));
    }
    case 'unread': {
      const cfg = loadConfig(root);
      const r = unread({ root, me: a.me });
      if (a.json) return console.log(JSON.stringify(r, null, 2));
      if (!r.length) return console.log(cfg.t.none);
      imprimirAvisos(r.flatMap((u) => u.avisos ?? []), cfg.lang === 'es');
      // M27: one line per message (sender, number, date, subject).
      // 0.12 (A1): las decisiones de la titular («decision: …»), destacadas.
      const marca = (m) => (m.decision ? (cfg.lang === 'es' ? '⚑ DECISIÓN · ' : '⚑ DECISION · ') : '');
      if (a.resumen || a.summary) {
        for (const u of r) for (const m of u.messages) console.log(`${marca(m)}${u.from}#${m.n} · ${m.date} · ${m.subject}`);
        return;
      }
      for (const u of r) {
        console.log(`\n== ${cfg.t.unreadFrom(u.from, u.messages.length)}`);
        for (const m of u.messages) {
          console.log(`${marca(m)}#${m.n} · ${m.date}${m.commit ? ` · ${m.commit}` : ''} · ${m.subject}`);
          if (m.expect) console.log(`   ${cfg.t.expects}: ${m.expect}`);
        }
      }
      return;
    }
    case 'ack': {
      const r = ack({ root, me: a.me, from: a.from, upto: a.upto, all: !!a.all });
      console.log(`ok · ${Object.entries(r).map(([k, v]) => `${k} #${v}`).join(' · ')}`);
      const t = loadConfig(root).t;
      for (const x of pendingAnswers({ root, me: a.me })) console.log(t.pending(x));
      return;
    }
    case 'show': {
      const m = show({ root, de: a.de ?? a.from, num: a.num ?? a.n });
      return console.log(`## ${m.from}#${m.n} · ${m.date}${m.commit ? ` · commit ${m.commit}` : ''}\n${m.body}`);
    }
    case 'status': {
      const r = status({ root });
      if (a.json) return console.log(JSON.stringify(r, null, 2));
      const now = Date.now();
      const es = loadConfig(root).lang === 'es';
      for (const s of r) {
        const h = s.health;
        const hl = h
          ? ` · ${h.estado === 'saturado' ? 'SATURADO' : h.estado}${h.libreDesde ? ` · libre ${Math.floor((now - new Date(h.libreDesde).getTime()) / 60000)} min` : ''}${h.ramGB != null ? ` · RAM ${h.ramGB} GB` : ''}${h.compartidaGB != null ? ` · ${es ? 'compartida' : 'shared'} ${h.compartidaGB} GB` : ''}${h.pesadoEnCurso ? ` · ${h.pesadoEnCurso}` : ''}`
          : '';
        // «despierto» solo con la Completa (awake es suyo).
        const awake = ext ? ` ${es ? 'despierto' : 'awake'}: ${ext.estaDespierto(root, s.session) ? (es ? 'sí' : 'yes') : 'no'} ·` : '';
        const comp = s.compactandoDesde ? ` · ${es ? 'COMPACTANDO' : 'COMPACTING'} ${Math.floor((now - new Date(s.compactandoDesde).getTime()) / 60000)} min` : '';
        // 0.12: versión, red (IP y estado) y «sin noticias» (latido) si pasa del umbral.
        const latido = loadConfig(root).latidoMin ?? LATIDO_DEFAULT_MIN;
        const ver = ` · v${s.version ?? '≤0.11'}`;
        const rd = s.red ? ` · ${es ? 'red' : 'net'} ${s.red.ip ?? '?'}${s.red.estado && !/^(encendido|on)$/.test(s.red.estado) ? ` (${s.red.estado})` : ''}` : '';
        const sn = s.sinNoticiasMin != null && s.sinNoticiasMin > latido ? ` · ${es ? 'SIN NOTICIAS' : 'NO NEWS'} ${Math.floor(s.sinNoticiasMin / 60)} h` : '';
        console.log(
          `${s.session.padEnd(12)}${s.coordinator ? '*' : ' '}${awake} ${es ? 'último' : 'last'} #${s.lastMessage} ${s.lastDate ?? ''} · ${es ? 'sin leer' : 'unread'} ${s.unread}${comp}${sn}${ver}${s.maquina ? ` · ${es ? 'máquina' : 'machine'} ${s.maquina}` : ''}${rd}${s.agent ? ` · ${s.agent}` : ''}${hl}${s.caps.length ? ` · [${s.caps.join(', ')}]` : ''}`,
        );
      }
      const cfg = loadConfig(root);
      const vs = new Set(r.map((s) => s.version ?? '≤0.11'));
      if (vs.size > 1) console.error(es ? `aviso · versiones distintas en esta carpeta: ${[...vs].join(', ')} · los cerrojos y avisos solo valen si todas tienen la misma` : `notice · different versions in this folder: ${[...vs].join(', ')} · locks and notices only work if all have the same one`);
      imprimirAvisos(r.flatMap((s) => s.avisos ?? []), es);
      for (const l of ext ? ext.locks({ root }) : []) console.log(`${es ? 'cerrojo' : 'lock'} ${l.recurso}: ${l.sesion ?? '?'}${l.tarea ? ` (${l.tarea})` : ''} · ${l.ts ?? ''}`);
      console.log(
        cfg.lang === 'es'
          ? `incidencias: ${cfg.incidencias === true ? 'encendidas' : 'apagadas'}`
          : `incidents: ${cfg.incidencias === true ? 'on' : 'off'}`,
      );
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
              : x.kind === 'compactando'
                ? `${cfg.t.compacting(x)} · --mark ${x.key}`
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
        maintainer: a.maintainer,
        errorReports: a['error-reports'],
        prueba: a.prueba,
        red: a.red,
        latido: a.latido,
      });
      const es = loadConfig(root).lang === 'es';
      const n = (x) => (es ? String(x).replace('.', ',') : String(x));
      const rc = r.recursos;
      return console.log(
        es
          ? [
              `ok · recordatorios: ${r.mode === 'auto' ? 'automáticos' : 'escalan a la persona'} (base ${r.baseMin} min, tope ${r.maxMin} min)`,
              `ayuda: carga ≥ ${r.assist.minLoad}, la mía ≤ ${r.assist.ownMax}, cada ${r.assist.cooldownMin} min`,
              `recursos: RAM mínima ${n(rc.ramDisponibleMinGB)} GB, justa ${n(rc.ramJustoGB)} GB, carga máx. ${n(rc.cargaMaxPorNucleo)} por núcleo, disco del repo ${n(rc.discoRepoMinGB)} GB, compartida ${n(rc.discoCompartidaMinGB)} GB, recordar libre a los ${rc.libreRecordarMin} min`,
              `incidencias: ${r.incidencias ? 'encendidas' : 'apagadas'} · mantenedora: ${r.mantenedora ?? '—'} · avisos de errores: ${r.avisoErrores ? 'encendidos' : 'apagados'}`,
              `prueba (M67): ${r.prueba}`,
              `red: ${r.red ? 'encendida' : 'apagada'} · sin noticias a partir de ${r.latidoMin} min`,
            ].join('\n')
          : [
              `ok · reminders: ${r.mode} (base ${r.baseMin} min, max ${r.maxMin} min)`,
              `assist: load ≥ ${r.assist.minLoad}, own ≤ ${r.assist.ownMax}, every ${r.assist.cooldownMin} min`,
              `resources: min RAM ${rc.ramDisponibleMinGB} GB, tight ${rc.ramJustoGB} GB, max load ${rc.cargaMaxPorNucleo} per core, repo disk ${rc.discoRepoMinGB} GB, shared ${rc.discoCompartidaMinGB} GB, free reminder after ${rc.libreRecordarMin} min`,
              `incidents: ${r.incidencias ? 'on' : 'off'} · maintainer: ${r.mantenedora ?? '—'} · error reports: ${r.avisoErrores ? 'on' : 'off'}`,
              `proof (M67): ${r.prueba}`,
              `network: ${r.red ? 'on' : 'off'} · no news after ${r.latidoMin} min`,
            ].join('\n'),
      );
    }
    case 'log': {
      const e = logIncident({ root, me: a.me, tipo: a.tipo, texto: a.texto, claudeCode: a.cc });
      imprimirAvisos(e.avisos, loadConfig(root).lang === 'es');
      return console.log(`ok · ${e.tipo} · ${e.texto}`);
    }
    case 'report': {
      const r = report({ root, desde: a.desde && a.desde !== true ? String(a.desde) : undefined, retro: !!a.retro, issue: !!a.issue });
      return console.log(`ok · ${r.total} · ${r.file}${r.product ? ` · Claude Code: ${r.product} → /feedback` : ''}`);
    }
    case 'health': {
      // --watch <s>: repeat while a heavy job is marked (--busy), then stop on its own (at most 4 h).
      // --report, --repo y --wait-ok son de la Completa (punto de extensión).
      if (a.report) return soloCompleta(ext, 'health --report') ?? ext.healthReport(a, root);
      if (a.repo) soloCompleta(ext, 'health --repo');
      const repo = ext ? ext.repoDeHealth(a) : process.cwd();
      const once = async (first) =>
        health({
          root,
          me: a.me,
          repo,
          busy: first && a.busy !== undefined ? (a.busy === true ? '' : String(a.busy)) : undefined,
          needs: first && a.needs !== undefined && a.needs !== true ? String(a.needs) : undefined,
        });
      let r = await once(true);
      if (a['wait-ok']) {
        soloCompleta(ext, 'health --wait-ok');
        r = await ext.esperarOk(r, () => once(false), a);
      }
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
      // `estado` only changes with two samples in a row (hysteresis): say so when this sample differs.
      const es = loadConfig(root).lang === 'es';
      const sample =
        r.muestra !== r.estado
          ? es
            ? ` (esta muestra: ${r.muestra}; el estado cambia con 2 muestras seguidas)`
            : ` (this sample: ${r.muestra}; the state changes after 2 samples in a row)`
          : '';
      const tipH = ext?.avisoDespierto(root, a.me, es);
      if (tipH) console.error(tipH);
      // 0.12: versiones mezcladas (A6) y avisos conocidos nuevos (A18, AVISOS.md).
      const tvH = textoVersiones(r.versiones ?? [], es);
      if (tvH) console.error(`aviso · ${tvH}`);
      for (const x of r.avisosNuevos ?? []) console.error(`${es ? 'aviso conocido (AVISOS.md)' : 'known warning (AVISOS.md)'} · ${x}`);
      const origen = r.origenCarga?.length ? ` · ${es ? 'origen' : 'source'}: ${textoOrigen(r.origenCarga, es ? 'es' : 'en')}` : '';
      return console.log(
        `${r.estado}${sample}${r.motivos.length ? ` · ${r.motivos.join('; ')}` : ''} · RAM ${r.ram.disponibleGB ?? '?'} GB · load ${r.cpu.cargaPorNucleo}/core${origen} · repo ${r.repoNombre ?? ''} ${r.disco.repoLibreGB ?? '?'} GB · shared ${r.disco.compartidaLibreGB ?? '?'} GB · thermal ${r.termica.estado}${r.sent ? ` · sent #${r.sent}` : ''}`,
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
    case 'red':
    case 'network': {
      // 0.12 (A7): IP privada y hora del sistema, solas; --apago HH:MM antes de un apagado o reinicio previsto.
      const es = loadConfig(root).lang === 'es';
      const r = red({ root, me: a.me, apago: a.apago ?? a.shutdown });
      if (r.apagada) return console.log(es ? 'La línea de red está apagada en este proyecto (config --red on para encenderla).' : 'The network line is off in this project (config --red on to turn it on).');
      return console.log(`ok · ${r.ip ?? (es ? 'sin IP privada' : 'no private IP')} · ${r.ts} · ${r.estado}`);
    }
    case 'compactar':
    case 'compact': {
      const es = loadConfig(root).lang === 'es';
      // Sin --repo, el de la carpeta actual (si no es un repo, basta con la fecha); --repo none, sin repo.
      const repo = a.repo === 'none' ? null : a.repo && a.repo !== true ? path.resolve(String(a.repo)) : process.cwd();
      const r = compactar({ root, me: a.me, memoria: a.memoria, repo });
      imprimirAvisos(r.avisos, es);
      return console.log(
        es
          ? `ok · compactando · retomar.md de ${r.edadMin} min${r.commit ? ` · cita ${r.commit}` : ' · sin repo: basta la fecha'} · ${r.ficheros} ficheros barridos, 0 secretos${r.n ? ` · aviso #${r.n}` : ''} · al volver: w retomado`
          : `ok · compacting · retomar.md ${r.edadMin} min old${r.commit ? ` · quotes ${r.commit}` : ' · no repo: the date is enough'} · ${r.ficheros} files swept, 0 secrets${r.n ? ` · notice #${r.n}` : ''} · when back: w retomado`,
      );
    }
    case 'retomado':
    case 'resumed': {
      const es = loadConfig(root).lang === 'es';
      const r = retomado({ root, me: a.me });
      if (!r.habia) return console.log(es ? 'No había ninguna compactación abierta.' : 'There was no open compaction.');
      return console.log(es ? `ok · retomado tras ${r.min} min${r.n ? ` · aviso #${r.n}` : ''}` : `ok · resumed after ${r.min} min${r.n ? ` · notice #${r.n}` : ''}`);
    }
    default:
      throw new WassupError(`Orden desconocida «${cmd}».\n${ayuda}`, `Unknown command «${cmd}».\n${ayuda}`);
  }
}

/**
 * ¿Se ejecuta este fichero como programa? Compara las rutas REALES: llamado por un enlace simbólico o una unión
 * (en macOS, /var → /private/var y /tmp → /private/tmp; o una carpeta de skills enlazada), argv[1] e
 * import.meta.url no coinciden letra a letra y, sin esto, la orden no hacía nada y salía con 0.
 */
export function esPrograma(argv1, url) {
  if (!argv1) return false;
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  return real(argv1) === real(fileURLToPath(url));
}

const isMain = esPrograma(process.argv[1], import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).catch(async (e) => {
    const argv = process.argv.slice(2);
    const lang = idiomaDeSalida(argv);
    console.error(e instanceof WassupError ? `wassup: ${e.texto(lang)}` : e);
    // M25 (Completa): aviso saneado a la mantenedora (solo con opt-in; nunca tapa el error original).
    const val = (k) => {
      const i = argv.indexOf(k);
      return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
    };
    const root = val('--root');
    const me = val('--me') ?? val('--from') ?? val('--by') ?? val('--name');
    const ext = await cargarCompleta().catch(() => null);
    if (root && me && ext?.trasError) ext.trasError({ root: path.resolve(root), me, orden: argv[0], error: e, lang });
    process.exit(1);
  });
}
