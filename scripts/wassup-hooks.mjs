#!/usr/bin/env node
// Hooks de Wassup (opt-in, sin dependencias): acuse · ordenes · secretos · hora.
// Uso: node wassup-hooks.mjs <acuse|ordenes|secretos|hora> [--root <carpeta>] [--me <sesión>]
// Lee el JSON del hook por stdin. Sin carpeta común (--root o WASSUP_ROOT) no hace nada (sale 0).
// Sin red. Solo escribe dentro de la carpeta común.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { findSecrets, loadConfig, parseMailbox, scrub } from './wassup.mjs';

const ACUSES = 'ACUSES';
const ORDENES = 'ORDENES';
const MSG_FIELDS = ['message', 'content', 'body', 'text'];

const pad = (n) => String(n).padStart(2, '0');
const lang = (cfg) => (cfg?.lang === 'en' ? 'en' : 'es');

/** «2026-10-11 09:30 +02:00», hora local del sistema. */
export function horaSistema(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sg = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${sg}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

// ---------- 2) acuse de recibo ----------
const ackFile = (root, from, n, me) => path.join(root, ACUSES, `RECIBIDO-${from}-${n}-${me}.txt`);

/** El receptor deja «RECIBIDO <de>#<n>» por cada mensaje que le toca y aún no tiene acuse. Devuelve los ids nuevos. */
export function dejarAcuses({ root, me, now = new Date() }) {
  const cfg = loadConfig(root);
  const nuevos = [];
  for (const from of cfg.sessions) {
    if (from === me) continue;
    const f = path.join(root, cfg.t.dir, `${from}.md`);
    if (!fs.existsSync(f)) continue;
    for (const m of parseMailbox(fs.readFileSync(f, 'utf8'))) {
      if (!m.to.includes(me) && !m.to.some((x) => ['all', 'todas', 'todos'].includes(x))) continue;
      const file = ackFile(root, from, m.n, me);
      if (fs.existsSync(file)) continue;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `RECIBIDO ${from}#${m.n}\npor: ${me}\nfecha: ${horaSistema(now)}\n`);
      nuevos.push(`${from}#${m.n}`);
    }
  }
  return nuevos;
}

/** Mensajes enviados por «me» a los que aún le falta el acuse de algún destinatario. */
export function sinAcuse({ root, me }) {
  const cfg = loadConfig(root);
  const f = path.join(root, cfg.t.dir, `${me}.md`);
  if (!fs.existsSync(f)) return [];
  const out = [];
  for (const m of parseMailbox(fs.readFileSync(f, 'utf8'))) {
    const dest = m.to.some((x) => ['all', 'todas', 'todos'].includes(x)) ? cfg.sessions.filter((s) => s !== me) : m.to;
    const faltan = dest.filter((d) => d !== me && !fs.existsSync(ackFile(root, me, m.n, d)));
    if (faltan.length) out.push({ id: `${me}#${m.n}`, n: m.n, subject: m.subject, faltan });
  }
  return out;
}

// ---------- 3) ORDENES con firma ----------
/** Copia la orden del usuario a ORDENES/. La «firma» es un hash de integridad (detecta ediciones), no autentica. */
export function guardarOrden({ root, sesion, texto, now = new Date() }) {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  const limpio = findSecrets(t).length ? scrub(t) : t; // un secreto pegado no se copia
  const fecha = horaSistema(now);
  const firma = crypto.createHash('sha256').update(`${fecha}\n${sesion}\n${limpio}`).digest('hex').slice(0, 16);
  const stampName = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const file = path.join(root, ORDENES, `${stampName}-${sesion}-${firma.slice(0, 6)}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# ORDEN DEL USUARIO\nfecha: ${fecha}\nsesión: ${sesion}\nfirma: ${firma}\n\n${limpio}\n`);
  return file;
}

// ---------- 4) bloqueo de secretos ----------
const camposDe = (input) => MSG_FIELDS.filter((k) => typeof input?.[k] === 'string');

/** { bloquear, tipos } para un tool_input de SendMessage. */
export function revisarSecretos(input) {
  const tipos = new Set();
  for (const k of camposDe(input)) findSecrets(input[k]).forEach((x) => tipos.add(x));
  if (typeof input?.summary === 'string') findSecrets(input.summary).forEach((x) => tipos.add(x));
  return { bloquear: tipos.size > 0, tipos: [...tipos] };
}

// ---------- 5) hora ----------
const MARCA = /\[hora: [^\]]*\]\s*$/;

/** tool_input con la hora del sistema añadida al final del primer campo de mensaje (idempotente). */
export function conHora(input, now = new Date()) {
  const k = camposDe(input)[0];
  if (!k || MARCA.test(input[k])) return null;
  return { ...input, [k]: `${input[k].replace(/\s*$/, '')}\n\n[hora: ${horaSistema(now)}]` };
}

// ---------- CLI ----------
function arg(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function main(argv = process.argv.slice(2), stdinText, env = process.env) {
  const [cmd] = argv;
  const root = arg(argv, 'root') ?? env.WASSUP_ROOT;
  if (!root || !fs.existsSync(path.join(root, 'wassup.json'))) return { code: 0 };
  let ev = {};
  try { ev = JSON.parse(stdinText || '{}'); } catch { /* sin JSON: se sigue con vacío */ }
  const cfg = loadConfig(root);
  const me = arg(argv, 'me') ?? env.WASSUP_ME ?? String(ev.session_id ?? 'sesion').slice(0, 8);
  const es = lang(cfg) === 'es';
  if (cmd === 'acuse') {
    const nuevos = dejarAcuses({ root, me });
    return { code: 0, stdout: nuevos.length ? JSON.stringify({ hookSpecificOutput: { hookEventName: ev.hook_event_name ?? 'UserPromptSubmit', additionalContext: `RECIBIDO ${nuevos.join(', ')}` } }) : '' };
  }
  if (cmd === 'sin-acuse') {
    const l = sinAcuse({ root, me });
    return { code: 0, stdout: l.length ? l.map((x) => `${x.id} · ${x.subject} · ${es ? 'falta' : 'missing'}: ${x.faltan.join(', ')}`).join('\n') : es ? 'Todo con acuse.' : 'All acknowledged.' };
  }
  if (cmd === 'ordenes') {
    guardarOrden({ root, sesion: me, texto: ev.prompt });
    return { code: 0 };
  }
  if (cmd === 'secretos') {
    const r = revisarSecretos(ev.tool_input);
    if (!r.bloquear) return { code: 0 };
    const why = es
      ? `Wassup bloquea el mensaje: contiene ${r.tipos.join(' y ')} (clave o contraseña). Quítalo y vuelve a enviarlo; los secretos no viajan entre sesiones.`
      : `Wassup blocked the message: it contains a ${r.tipos.join(' and ')} (key or password). Remove it and send again; secrets never travel between sessions.`;
    return { code: 2, stderr: why };
  }
  if (cmd === 'hora') {
    const nuevo = conHora(ev.tool_input);
    return { code: 0, stdout: nuevo ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: nuevo } }) : '' };
  }
  return { code: 0 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let data = '';
  if (!process.stdin.isTTY) for await (const c of process.stdin) data += c;
  const r = await main(process.argv.slice(2), data);
  if (r.stdout) process.stdout.write(r.stdout + '\n');
  if (r.stderr) process.stderr.write(r.stderr + '\n');
  process.exit(r.code);
}
