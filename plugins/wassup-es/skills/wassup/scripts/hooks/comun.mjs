// Utilidades comunes de los hooks de Wassup. Sin dependencias.
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Lee todo stdin y lo devuelve como objeto (o {} si no es JSON). */
export async function leerEntrada(stream = process.stdin) {
  let txt = '';
  for await (const trozo of stream) txt += trozo;
  try { return JSON.parse(txt || '{}'); } catch { return {}; }
}

/** true si el módulo se ejecuta directamente (no importado por una prueba). */
export const esPrincipal = (url) => {
  if (!process.argv[1]) return false;
  // Rutas REALES: llamado por una unión o un enlace simbólico, sin esto el hook salía con 0 y en silencio.
  const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
  return real(process.argv[1]) === real(fileURLToPath(url));
};

/** Id corto y estable de un mensaje (8 hex). */
export const idMensaje = (...partes) => createHash('sha256').update(partes.join('\u0000')).digest('hex').slice(0, 8);

/** «12-10-2026 07:50 CEST» con la hora del sistema. */
export function horaSistema(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  let zona = '';
  try {
    zona = new Intl.DateTimeFormat('es-ES', { timeZoneName: 'short' }).formatToParts(d).find((x) => x.type === 'timeZoneName')?.value ?? '';
  } catch { /* sin Intl completo */ }
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}${zona ? ' ' + zona : ''}`;
}

export const salir = (obj) => { if (obj) process.stdout.write(JSON.stringify(obj)); process.exit(0); };
