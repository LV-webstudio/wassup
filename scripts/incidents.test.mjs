// Pruebas de M23 (incidencias y reportes) · node --test scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configure, INCIDENT_SCHEMA, init, logIncident, readIncidents, register, report, scrub, VERSION } from './wassup.mjs';

const SCRIPT = fileURLToPath(new URL('./wassup.mjs', import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-inc-'));
const NOW = new Date('2026-09-29T20:00:00Z');
const at = (d) => new Date(NOW.getTime() + d * 24 * 3600 * 1000);

function three({ on = true } = {}) {
  const root = tmp();
  init({ root, name: 'legal', lang: 'es' });
  for (const n of ['crmweb', 'mac']) {
    register({ root, by: 'legal', name: n });
    init({ root, name: n });
  }
  if (on) configure({ root, by: 'legal', incidents: 'on' });
  return root;
}

test('filtro de privacidad: correos, teléfonos, tokens, rutas absolutas y rutas de URL', () => {
  const t = scrub(
    'Bloqueo en C:\\Users\\usuaria\\Desktop\\x.json y /Users/alguien/a.md y ~/claves, \\\\servidor\\compartida\\f; ' +
      'correo persona@ejemplo.com, tel +34 612 345 678 y 612345678; token ghp_abcdefghijklmnopqrstu1234567890, ' +
      'AIzaSyD-abcdefghijklmnop1234, eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc, ' +
      'clave 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08; ' +
      'URL https://ferro-properties.example.com/api/x?key=secreto',
  );
  for (const bad of ['usuaria', 'alguien', 'claves', 'servidor', 'persona@', '612', 'ghp_', 'AIza', 'eyJ', '9f86d0', 'secreto', '/api/x'])
    assert.ok(!t.includes(bad), `debe quitar «${bad}»: ${t}`);
  for (const good of ['[ruta]', '[correo]', '[teléfono]', '[token]', 'https://ferro-properties.example.com'])
    assert.ok(t.includes(good), `debe dejar «${good}»: ${t}`);
  // Lo que no es secreto se queda: commits, versiones, recuentos.
  assert.equal(scrub('commit 6329a2c, versión 0.9.0, batería 150/0/28 y 37 pruebas'), 'commit 6329a2c, versión 0.9.0, batería 150/0/28 y 37 pruebas');
  assert.ok(scrub('x'.repeat(500)).length <= 300);
  assert.equal(scrub('una\nlínea\tsola'), 'una línea sola');
});

test('opt-in: sin «config --incidents on» no se apunta nada', () => {
  const root = three({ on: false });
  assert.throws(() => logIncident({ root, me: 'crmweb', tipo: 'idea', texto: 'x' }), /opt-in/);
  assert.ok(!fs.existsSync(path.join(root, 'incidencias')));
  assert.throws(() => configure({ root, by: 'crmweb', incidents: 'on' }), /coordinator/);
  assert.equal(configure({ root, by: 'legal', incidents: 'on' }).incidencias, true);
  assert.equal(configure({ root, by: 'legal', incidents: 'off' }).incidencias, false);
});

test('w log: una línea por incidencia, formato estable, tipos cerrados y solo en MI fichero', () => {
  const root = three();
  const e = logIncident({ root, me: 'crmweb', tipo: 'bloqueo-permiso', texto: 'Create Public Surface al subir a GitHub', claudeCode: '2.1.283', now: NOW });
  assert.deepEqual(Object.keys(e), ['schema', 'ts', 'sesion', 'wassup', 'claudeCode', 'so', 'tipo', 'texto']);
  assert.equal(e.schema, INCIDENT_SCHEMA);
  assert.equal(e.wassup, VERSION);
  logIncident({ root, me: 'crmweb', tipo: 'idea', texto: 'M22 vigilancia de recursos', now: NOW });
  const lines = fs.readFileSync(path.join(root, 'incidencias', 'crmweb.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.ok(!fs.existsSync(path.join(root, 'incidencias', 'legal.jsonl')));
  assert.throws(() => logIncident({ root, me: 'crmweb', tipo: 'otra-cosa', texto: 'x' }), /--tipo/);
  assert.throws(() => logIncident({ root, me: 'crmweb', tipo: 'idea', texto: '   ' }), /--texto/);
});

test('borrado a los 90 días (al escribir)', () => {
  const root = three();
  logIncident({ root, me: 'mac', tipo: 'reintento', texto: 'viejo', now: NOW });
  logIncident({ root, me: 'mac', tipo: 'reintento', texto: 'reciente', now: at(60) });
  logIncident({ root, me: 'mac', tipo: 'reintento', texto: 'nuevo', now: at(95) });
  assert.deepEqual(readIncidents({ root }).map((e) => e.texto), ['reciente', 'nuevo']);
});

/** Los casos reales del 29-09-2026 (legal#31). */
function casosReales(root) {
  const log = (me, tipo, texto, h) => logIncident({ root, me, tipo, texto, claudeCode: '2.1.283', now: new Date(NOW.getTime() + h * 3600000) });
  log('legal', 'bloqueo-permiso', 'Despliegue de reglas de Firestore denegado', 0);
  log('legal', 'bloqueo-permiso', 'Script con --aplicar en producción denegado', 1);
  log('legal', 'bloqueo-permiso', 'IAM del bucket denegado', 2);
  log('crmweb', 'bloqueo-permiso', 'Subida a GitHub denegada (Create Public Surface)', 3);
  log('crmweb', 'sesion-saturada', 'PC con 221 MB libres: e2e cortado por memoria', 4);
  for (const h of [5, 6, 7]) log('legal', 'sesion-ociosa', 'Mac parado 40 min; lo tuvo que decir el usuario', h);
  log('mac', 'correccion', 'Performance API sin Timing-Allow-Origin daba tiempos falsos', 8);
  log('mac', 'correccion', 'Content-Length de una petición HEAD tomado como tamaño real', 9);
  log('legal', 'idea', 'M23 registro de incidencias y reportes', 10);
}

test('w report: anónimo, recuentos por tipo, lo repetido, ideas y canales; nunca envía', () => {
  const root = three();
  casosReales(root);
  const r = report({ root, now: NOW });
  assert.equal(r.total, 11);
  assert.equal(r.product, 4);
  assert.equal(path.basename(r.file), '2026-09-29'.replace(/^/, 'reporte-') + '.md');
  const t = r.text;
  for (const s of ['legal', 'crmweb', 'mac ']) assert.ok(!t.includes(s), `no debe salir la sesión «${s.trim()}»`);
  assert.match(t, /\| bloqueo-permiso \| 4 \|/);
  assert.match(t, /\| sesion-ociosa \| 3 \|/);
  assert.match(t, /sesion-ociosa · c parado # min; lo tuvo que decir el usuario \(3\)/);
  assert.match(t, /## Ideas\n- M23 registro de incidencias y reportes \(A\)/);
  assert.match(t, /Claude Code o el modelo: 4 incidencias de ese tipo \(bloqueo-permiso\)/);
  assert.match(t, /Léelo antes de enviarlo/);
  assert.match(t, /2\.1\.283 \(11\)/);
});

test('w report --retro y --issue', () => {
  const root = three();
  casosReales(root);
  const r = report({ root, retro: true, now: NOW });
  assert.match(r.text, /## Retrospectiva\n### Qué falló\n- bloqueo-permiso/);
  assert.match(r.text, /### Qué cambiar\n- Pasar el cuestionario de permisos/);
  assert.match(r.text, /- Repartir antes de hacer/);
  assert.match(r.text, /- Comprobar en la fuente/);
  const i = report({ root, issue: true, now: NOW });
  assert.match(i.text, /^# Wassup · reporte de incidencias \(2026-09-29\)/);
  assert.ok(!i.text.includes('## Detalle'));
  assert.ok(i.file.endsWith('-issue.md'));
  assert.equal(report({ root, desde: '2026-10-01', now: NOW }).total, 0);
});

test('línea de órdenes: log y report', () => {
  const root = three();
  const w = (...a) => execFileSync(process.execPath, [SCRIPT, ...a]).toString();
  assert.match(w('log', '--root', root, '--me', 'mac', '--tipo', 'idea', '--texto', 'probar con persona@ejemplo.com'), /\[correo\]/);
  assert.match(w('report', '--root', root, '--retro'), /^ok · 1 · .*reporte-\d{4}-\d{2}-\d{2}\.md/);
});

test('singular y plural en el reporte; aviso de opt-in en el idioma del proyecto', () => {
  const root = three();
  logIncident({ root, me: 'mac', tipo: 'mensaje-perdido', texto: 'directo retenido', now: NOW });
  const t = report({ root, now: NOW }).text;
  assert.match(t, /· 1 incidencia · 1 sesión/);
  assert.match(t, /Claude Code o el modelo: 1 incidencia de ese tipo/);
  const off = three({ on: false });
  assert.throws(() => logIncident({ root: off, me: 'mac', tipo: 'idea', texto: 'x' }), /Las incidencias están apagadas/);
});
