#!/usr/bin/env node
// Wassup · voz por turnos (sin dependencias, sin red).
//   node voz.mjs --root <carpeta común> --quien <sesión> [--emergencia] -- texto corto
// Varias sesiones comparten altavoz: solo habla una a la vez. El turno es una carpeta TURNO en la carpeta común
// (mkdir es atómico en Windows, macOS y Linux). Si otra está hablando, espera; un turno de más de 40 s se da por
// abandonado. Si en 120 s no consigue turno, NO habla y lo apunta. Horas de silencio (23-8 por defecto) salvo
// --emergencia. Cada mensaje queda en <root>/VOZ/registro-voz.txt. La voz se corta a los 30 s.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TURNO_ABANDONADO_S = 40;
export const ESPERA_MAX_S = 120;
export const VOZ_MAX_S = 30;

/** ¿Estamos en horas de silencio? desde-hasta en horas locales (23 y 8: de 23:00 a 7:59). */
export function enSilencio(fecha = new Date(), desde = 23, hasta = 8) {
  const h = fecha.getHours();
  return desde > hasta ? h >= desde || h < hasta : h >= desde && h < hasta;
}

/** Texto seguro para decir en voz alta: una línea, 300 caracteres como mucho. */
export function limpiar(texto) {
  return String(texto ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Intenta coger el turno una vez. Devuelve true si es nuestro. */
export function cogerTurno(dir, quien, ahoraS = Math.floor(Date.now() / 1000)) {
  const t = path.join(dir, 'TURNO');
  try {
    fs.mkdirSync(t);
    fs.writeFileSync(path.join(t, 'quien'), `${quien} ${ahoraS}\n`);
    return true;
  } catch {
    try {
      let t0 = NaN;
      try { t0 = Number(fs.readFileSync(path.join(t, 'quien'), 'utf8').trim().split(' ')[1]); } catch { /* sin «quien» */ }
      // Sin «quien» legible (una sesión cayó entre el mkdir y la escritura): manda la hora de la carpeta.
      if (!Number.isFinite(t0)) t0 = Math.floor(fs.statSync(t).mtimeMs / 1000);
      if (ahoraS - t0 > TURNO_ABANDONADO_S) fs.rmSync(t, { recursive: true, force: true });
    } catch { /* la carpeta desapareció: se reintenta */ }
    return false;
  }
}

export function soltarTurno(dir) {
  fs.rmSync(path.join(dir, 'TURNO'), { recursive: true, force: true });
}

/** Orden para hablar según el sistema (sin shell: el texto va como argumento). */
export function ordenVoz(texto, plataforma = process.platform) {
  if (plataforma === 'win32') {
    const ps = 'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
      "$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'es-*' } | Select-Object -First 1; " +
      'if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.Speak($env:WASSUP_VOZ_TEXTO)';
    return { cmd: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', ps], env: { WASSUP_VOZ_TEXTO: texto } };
  }
  if (plataforma === 'darwin') return { cmd: 'say', args: ['-r', '170', texto] };
  return { cmd: 'spd-say', args: ['-w', '-l', 'es', texto] };
}

function hablarDeVerdad(texto) {
  return new Promise((resolve) => {
    const o = ordenVoz(texto);
    let p;
    try { p = spawn(o.cmd, o.args, { stdio: 'ignore', env: { ...process.env, ...(o.env ?? {}) } }); } catch { return resolve('sin-voz'); }
    const reloj = setTimeout(() => { p.kill(); resolve('cortada'); }, VOZ_MAX_S * 1000);
    p.on('error', () => { clearTimeout(reloj); resolve('sin-voz'); });
    p.on('exit', () => { clearTimeout(reloj); resolve('ok'); });
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Dice el texto con turno. Devuelve 'silencio' | 'sin-turno' | 'ok' | 'cortada' | 'sin-voz'.
 * hablar, ahora y dormir se pueden sustituir en las pruebas.
 */
export async function voz({ root, quien, texto, emergencia = false, ahora = () => new Date(), hablar = hablarDeVerdad, dormir = esperar, esperaMaxS = ESPERA_MAX_S }) {
  const dir = path.join(root, 'VOZ');
  fs.mkdirSync(dir, { recursive: true });
  const linea = limpiar(texto);
  const registro = (r) => {
    const d = ahora();
    const f = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')} ${d.toTimeString().slice(0, 8)}`;
    fs.appendFileSync(path.join(dir, 'registro-voz.txt'), `${f} ${quien}${r === 'ok' ? '' : ` (${r})`}: ${linea}\n`);
  };
  if (enSilencio(ahora()) && !emergencia) { registro('silencio'); return 'silencio'; }
  let mio = false;
  for (let i = 0; i < esperaMaxS && !mio; i++) {
    mio = cogerTurno(dir, quien, Math.floor(ahora().getTime() / 1000));
    if (!mio) await dormir(1000);
  }
  if (!mio) { registro('sin-turno'); return 'sin-turno'; }
  try {
    const r = await hablar(`${quien}. ${linea}`);
    registro(r);
    return r;
  } finally {
    soltarTurno(dir);
  }
}

const arg = (argv, n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

/** ¿Se ejecuta como programa? Compara rutas REALES (una unión o un enlace simbólico no lo deja mudo). */
function esPrograma(argv1, url) {
  if (!argv1) return false;
  const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  return real(argv1) === real(fileURLToPath(url));
}

if (esPrograma(process.argv[1], import.meta.url)) {
  const argv = process.argv.slice(2);
  const sep = argv.indexOf('--');
  const texto = sep >= 0 ? argv.slice(sep + 1).join(' ') : '';
  const root = arg(argv, 'root');
  const quien = arg(argv, 'quien');
  if (!root || !quien || !texto) {
    console.error('Uso: node voz.mjs --root <carpeta común> --quien <sesión> [--emergencia] -- texto corto');
    process.exit(2);
  }
  const r = await voz({ root, quien, texto, emergencia: argv.includes('--emergencia') });
  console.log(`voz: ${r}`);
  process.exit(r === 'sin-turno' ? 1 : 0);
}
