#!/usr/bin/env node
// Barra de estado de cuota de Wassup (sin dependencias, sin red).
//   statusline:  node cuota.mjs            (lee el JSON del statusline por stdin; imprime una línea)
//   instalar:    node cuota.mjs install --root <carpeta común> [--settings <settings.json>]
// Lee rate_limits del statusline de Claude Code y escribe <carpeta común>/cuota.json.
// Si ya había un statusline, lo conserva: se guarda su comando y se sigue ejecutando.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SEMANA_S = 7 * 24 * 3600;

/**
 * Nivel por % semanal y por ritmo (gasto real / gasto esperado a estas alturas de la semana).
 * NEGRO: casi agotada · ROJO: ≥85 % o ritmo ≥1,5 · ÁMBAR: ≥70 % o ritmo ≥1,15 · VERDE: el resto.
 */
export function nivel({ semanal, cincoH, ritmo }) {
  if (semanal >= 97 || cincoH >= 99) return 'NEGRO';
  if (semanal >= 85 || (ritmo != null && ritmo >= 1.5 && semanal >= 20)) return 'ROJO';
  if (semanal >= 70 || (ritmo != null && ritmo >= 1.15 && semanal >= 20)) return 'ÁMBAR';
  return 'VERDE';
}

/** Datos del statusline → registro de cuota (o null si no trae rate_limits, p. ej. con API key). */
export function calcular(ev, nowMs = Date.now()) {
  const rl = ev?.rate_limits;
  const sem = rl?.seven_day;
  if (!sem || typeof sem.used_percentage !== 'number') return null;
  const semanal = sem.used_percentage;
  const cincoH = typeof rl.five_hour?.used_percentage === 'number' ? rl.five_hour.used_percentage : 0;
  let ritmo = null;
  if (typeof sem.resets_at === 'number') {
    const restante = Math.min(SEMANA_S, Math.max(0, sem.resets_at - nowMs / 1000));
    const transcurrido = SEMANA_S - restante;
    if (transcurrido > 3600) ritmo = Math.round((semanal / ((transcurrido / SEMANA_S) * 100)) * 100) / 100;
  }
  return {
    esquema: 'wassup-cuota/1',
    actualizado: new Date(nowMs).toISOString(),
    semanal_pct: semanal,
    cinco_horas_pct: cincoH,
    ritmo,
    nivel: nivel({ semanal, cincoH, ritmo }),
  };
}

const ICONO = { VERDE: '🟢', 'ÁMBAR': '🟠', ROJO: '🔴', NEGRO: '⚫' };

function escribir(root, rec) {
  const f = path.join(root, 'cuota.json');
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 2) + '\n');
  fs.renameSync(tmp, f);
}

const CFG = path.join(os.homedir(), '.claude', 'wassup-cuota.json');

/** Statusline: guarda cuota.json y devuelve el texto de la barra (+ la del statusline anterior, si había). */
export function linea(stdinText, cfg, nowMs = Date.now(), run = (cmd, input) => execSync(cmd, { input, encoding: 'utf8', timeout: 5000 })) {
  let ev = {};
  try { ev = JSON.parse(stdinText || '{}'); } catch { /* vacío */ }
  const rec = calcular(ev, nowMs);
  if (rec && cfg?.root) { try { escribir(cfg.root, rec); } catch { /* carpeta no disponible: la barra sigue */ } }
  let previa = '';
  if (cfg?.prev) { try { previa = String(run(cfg.prev, stdinText)).trim(); } catch { /* el anterior falló */ } }
  const mia = rec ? `${ICONO[rec.nivel]} ${rec.nivel} ${Math.round(rec.semanal_pct)}%${rec.ritmo != null ? ` ×${rec.ritmo}` : ''}` : '';
  return [previa, mia].filter(Boolean).join(' · ');
}

/**
 * Instalación: copia de seguridad de settings.json (siempre, si existe) y statusLine → este script.
 * Si había un statusline ajeno, su comando pasa a `wassup-cuota.json` (prev) y se sigue mostrando.
 * Idempotente: si ya está instalada, no vuelve a capturar «prev» (no se pierde el original).
 */
export function instalar({ settings, root, script, cfgFile = CFG, now = new Date() }) {
  let cur = {};
  if (fs.existsSync(settings)) {
    cur = JSON.parse(fs.readFileSync(settings, 'utf8') || '{}');
    const bak = `${settings}.wassup-bak-${now.toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(settings, bak);
  }
  const mio = `node "${script}"`;
  const previo = cur.statusLine?.command;
  const yaMio = typeof previo === 'string' && previo.includes('cuota.mjs');
  let prev = null;
  if (yaMio) { try { prev = JSON.parse(fs.readFileSync(cfgFile, 'utf8')).prev ?? null; } catch { /* sin config */ } }
  else if (typeof previo === 'string') prev = previo;
  fs.mkdirSync(path.dirname(cfgFile), { recursive: true });
  fs.writeFileSync(cfgFile, JSON.stringify({ root, prev }, null, 2) + '\n');
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  fs.writeFileSync(settings, JSON.stringify({ ...cur, statusLine: { type: 'command', command: mio } }, null, 2) + '\n');
  return { prev, backup: fs.existsSync(settings) };
}

function arg(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  if (argv[0] === 'install') {
    const root = arg(argv, 'root');
    if (!root) { console.error('Falta --root <carpeta común> / --root is required.'); process.exit(1); }
    const settings = arg(argv, 'settings') ?? path.join(os.homedir(), '.claude', 'settings.json');
    const r = instalar({ settings, root: path.resolve(root), script: fileURLToPath(import.meta.url) });
    console.log(`Barra de cuota instalada · ${r.prev ? 'statusline anterior conservado' : 'sin statusline anterior'} · copia: ${settings}.wassup-bak-*`);
  } else {
    let data = '';
    if (!process.stdin.isTTY) for await (const c of process.stdin) data += c;
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch { /* sin config */ }
    process.stdout.write(linea(data, cfg) + '\n');
  }
}
