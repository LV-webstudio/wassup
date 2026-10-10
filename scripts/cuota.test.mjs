// Pruebas de cuota.mjs · node --test scripts/cuota.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { aSegundos, calcular, instalar, linea, nivel } from './cuota.mjs';

const SCRIPT = fileURLToPath(new URL('./cuota.mjs', import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-q-'));
const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);
// a mitad de semana (resets_at dentro de 3,5 días) → gasto esperado 50 %
const ev = (sem, cinco = 10) => ({ rate_limits: { five_hour: { used_percentage: cinco }, seven_day: { used_percentage: sem, resets_at: NOW / 1000 + 3.5 * 86400 } } });

test('niveles: VERDE / ÁMBAR / ROJO / NEGRO por % semanal y ritmo', () => {
  assert.equal(calcular(ev(30), NOW).nivel, 'VERDE'); // ritmo 0,6
  assert.equal(calcular(ev(60), NOW).nivel, 'ÁMBAR'); // ritmo 1,2
  assert.equal(calcular(ev(80), NOW).nivel, 'ROJO'); // ritmo 1,6
  assert.equal(calcular(ev(98), NOW).nivel, 'NEGRO');
  assert.equal(calcular(ev(10, 99.5), NOW).nivel, 'NEGRO'); // ventana de 5 h agotada
  assert.equal(nivel({ semanal: 72, cincoH: 0, ritmo: null }), 'ÁMBAR');
  assert.equal(nivel({ semanal: 86, cincoH: 0, ritmo: 0.5 }), 'ROJO');
  assert.equal(calcular({}, NOW), null);
});

test('statusline: escribe cuota.json y devuelve la línea (con el statusline anterior)', () => {
  const root = tmp();
  const out = linea(JSON.stringify(ev(60)), { root, prev: 'otro' }, NOW, () => 'MI-BARRA\n');
  assert.match(out, /^MI-BARRA · 🟠 ÁMBAR 60% ×1\.2$/);
  const j = JSON.parse(fs.readFileSync(path.join(root, 'cuota.json'), 'utf8'));
  assert.equal(j.nivel, 'ÁMBAR');
  assert.equal(j.semanal_pct, 60);
  assert.equal(linea('{}', { root }, NOW), ''); // sin rate_limits: no escribe nada ni falla
  assert.equal(linea(JSON.stringify(ev(10)), { root, prev: 'x' }, NOW, () => { throw new Error('x'); }).includes('VERDE'), true);
});

test('instalar: copia de seguridad, conserva el statusline ajeno y es idempotente', () => {
  const d = tmp();
  const settings = path.join(d, 'settings.json');
  const cfgFile = path.join(d, 'wassup-cuota.json');
  fs.writeFileSync(settings, JSON.stringify({ model: 'x', statusLine: { type: 'command', command: 'mi-barra --x' } }));
  const a = instalar({ settings, root: '/comun', script: '/p/cuota.mjs', cfgFile });
  assert.equal(a.prev, 'mi-barra --x');
  const baks = fs.readdirSync(d).filter((f) => f.includes('wassup-bak'));
  assert.equal(baks.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, baks[0]), 'utf8')).statusLine.command, 'mi-barra --x');
  const now = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.equal(now.model, 'x');
  assert.match(now.statusLine.command, /cuota\.mjs/);
  assert.equal(JSON.parse(fs.readFileSync(cfgFile, 'utf8')).prev, 'mi-barra --x');
  // segunda vez: no pierde el original
  const b = instalar({ settings, root: '/comun', script: '/p/cuota.mjs', cfgFile, now: new Date(Date.now() + 1000) });
  assert.equal(b.prev, 'mi-barra --x');
  assert.equal(JSON.parse(fs.readFileSync(cfgFile, 'utf8')).prev, 'mi-barra --x');
});

test('instalar sin settings previo y por CLI', () => {
  const d = tmp();
  const settings = path.join(d, 'sub', 'settings.json');
  const r = spawnSync(process.execPath, [SCRIPT, 'install', '--root', d, '--settings', settings], { encoding: 'utf8', env: { ...process.env, HOME: d, USERPROFILE: d } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(JSON.parse(fs.readFileSync(settings, 'utf8')).statusLine.command, /cuota\.mjs/);
  assert.equal(spawnSync(process.execPath, [SCRIPT, 'install'], { encoding: 'utf8' }).status, 1);
});

test('instalador .sh: un paso, con copia y sin machacar el statusline', { skip: process.platform === 'win32' }, () => {
  const h = tmp();
  fs.mkdirSync(path.join(h, '.claude'));
  fs.writeFileSync(path.join(h, '.claude', 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'viejo' } }));
  const sh = fileURLToPath(new URL('../hooks/instalar-cuota.sh', import.meta.url));
  const r = spawnSync('sh', [sh, path.join(h, 'comun')], { encoding: 'utf8', env: { ...process.env, HOME: h } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(h, '.claude', 'wassup-cuota.json'), 'utf8')).prev, 'viejo');
  assert.ok(fs.readdirSync(path.join(h, '.claude')).some((f) => f.includes('wassup-bak')));
  assert.equal(spawnSync('sh', [sh], { encoding: 'utf8' }).status, 1);
});

test('BOM: la entrada con BOM se lee; si no es JSON, avisa en vez de callar', () => {
  const root = tmp();
  const out = linea('\uFEFF' + JSON.stringify(ev(60)), { root }, NOW);
  assert.match(out, /ÁMBAR 60%/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'cuota.json'), 'utf8')).nivel, 'ÁMBAR');
  assert.match(linea('\uFEFF{roto', { root }, NOW), /^⚠ cuota: .*JSON/);
  assert.equal(linea('', { root }, NOW), ''); // vacío: sin aviso
});

test('instalar: una sola copia de seguridad aunque se instale varias veces', () => {
  const d = tmp();
  const settings = path.join(d, 'settings.json');
  const cfgFile = path.join(d, 'wassup-cuota.json');
  fs.writeFileSync(settings, JSON.stringify({ model: 'x' }));
  const a = instalar({ settings, root: '/c', script: '/p/cuota.mjs', cfgFile });
  const b = instalar({ settings, root: '/c', script: '/p/cuota.mjs', cfgFile, now: new Date(Date.now() + 5000) });
  const baks = fs.readdirSync(d).filter((f) => f.includes('wassup-bak'));
  assert.equal(baks.length, 1);
  assert.equal(a.backup, b.backup);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, baks[0]), 'utf8')).statusLine, undefined); // es la original
});

test('mensaje de instalación: sin «*» literal; da la ruta real de la copia', () => {
  const d = tmp();
  const settings = path.join(d, 'settings.json');
  fs.writeFileSync(settings, '{}');
  const r = spawnSync(process.execPath, [SCRIPT, 'install', '--root', path.join(d, 'c'), '--settings', settings], { encoding: 'utf8', env: { ...process.env, HOME: d, USERPROFILE: d } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stdout.includes('*'), r.stdout);
  assert.match(r.stdout, /wassup-bak-\d{4}-/);
});

test('resets_at: número en segundos o milisegundos, y cadena ISO 8601', () => {
  const reset = NOW / 1000 + 3.5 * 86400;
  const con = (v) => calcular({ rate_limits: { seven_day: { used_percentage: 60, resets_at: v } } }, NOW).ritmo;
  assert.equal(con(reset), 1.2);
  assert.equal(con(reset * 1000), 1.2);
  assert.equal(con(new Date(reset * 1000).toISOString()), 1.2);
  assert.equal(con(String(reset)), 1.2);
  assert.equal(con('no es fecha'), null);
  assert.equal(aSegundos(null), null);
});
