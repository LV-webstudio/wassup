import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { voz, enSilencio, limpiar, cogerTurno, ordenVoz, TURNO_ABANDONADO_S } from './voz.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-voz-'));
const mediodia = () => new Date(2026, 9, 12, 12, 0, 0);
const noche = () => new Date(2026, 9, 12, 2, 0, 0);
const registro = (root) => fs.readFileSync(path.join(root, 'VOZ', 'registro-voz.txt'), 'utf8');

test('silencio de 23 a 8 (y en el límite)', () => {
  assert.equal(enSilencio(new Date(2026, 0, 1, 23, 0)), true);
  assert.equal(enSilencio(new Date(2026, 0, 1, 7, 59)), true);
  assert.equal(enSilencio(new Date(2026, 0, 1, 8, 0)), false);
  assert.equal(enSilencio(new Date(2026, 0, 1, 22, 59)), false);
});

test('de noche no habla salvo --emergencia', async () => {
  const root = tmp();
  let dicho = null;
  assert.equal(await voz({ root, quien: 'sesion-a', texto: 'hola', ahora: noche, hablar: async (t) => { dicho = t; return 'ok'; } }), 'silencio');
  assert.equal(dicho, null);
  assert.equal(await voz({ root, quien: 'sesion-a', texto: 'caída', emergencia: true, ahora: noche, hablar: async (t) => { dicho = t; return 'ok'; } }), 'ok');
  assert.equal(dicho, 'sesion-a. caída');
});

test('habla, apunta en el registro y suelta el turno', async () => {
  const root = tmp();
  assert.equal(await voz({ root, quien: 'sesion-a', texto: 'línea\nuno', ahora: mediodia, hablar: async () => 'ok' }), 'ok');
  assert.match(registro(root), /12-10 12:00:00 sesion-a: línea uno\n/);
  assert.equal(fs.existsSync(path.join(root, 'VOZ', 'TURNO')), false);
});

test('con el turno ocupado espera y, sin turno, no habla y lo apunta', async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'VOZ'), { recursive: true });
  assert.equal(cogerTurno(path.join(root, 'VOZ'), 'sesion-b', Math.floor(mediodia().getTime() / 1000)), true);
  let esperas = 0;
  let dicho = false;
  const r = await voz({ root, quien: 'sesion-a', texto: 'hola', ahora: mediodia, esperaMaxS: 5, dormir: async () => { esperas++; }, hablar: async () => { dicho = true; return 'ok'; } });
  assert.equal(r, 'sin-turno');
  assert.equal(dicho, false);
  assert.equal(esperas, 5);
  assert.match(registro(root), /sesion-a \(sin-turno\): hola/);
  assert.match(fs.readFileSync(path.join(root, 'VOZ', 'TURNO', 'quien'), 'utf8'), /^sesion-b /, 'no toca el turno ajeno');
});

test('un turno abandonado (más de 40 s) se libera', async () => {
  const root = tmp();
  const dir = path.join(root, 'VOZ');
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Math.floor(mediodia().getTime() / 1000) - TURNO_ABANDONADO_S - 5;
  cogerTurno(dir, 'sesion-b', t0);
  const r = await voz({ root, quien: 'sesion-a', texto: 'hola', ahora: mediodia, esperaMaxS: 3, dormir: async () => {}, hablar: async () => 'ok' });
  assert.equal(r, 'ok');
});

test('el turno se suelta aunque la voz falle', async () => {
  const root = tmp();
  await assert.rejects(voz({ root, quien: 'sesion-a', texto: 'x', ahora: mediodia, hablar: async () => { throw new Error('altavoz'); } }));
  assert.equal(fs.existsSync(path.join(root, 'VOZ', 'TURNO')), false);
});

test('texto limpio y orden sin shell en cada sistema', () => {
  assert.equal(limpiar('a\r\n\tb   c'), 'a b c');
  assert.equal(limpiar('x'.repeat(400)).length, 300);
  const w = ordenVoz('hola; rm -rf /', 'win32');
  assert.equal(w.cmd, 'powershell');
  assert.equal(w.env.WASSUP_VOZ_TEXTO, 'hola; rm -rf /');
  assert.ok(!w.args.join(' ').includes('rm -rf'), 'el texto no va dentro del comando');
  assert.deepEqual(ordenVoz('hola', 'darwin'), { cmd: 'say', args: ['-r', '170', 'hola'] });
  assert.equal(ordenVoz('hola', 'linux').cmd, 'spd-say');
});

test('un TURNO sin «quien» se juzga por la hora de la carpeta', async () => {
  const root = tmp();
  const t = path.join(root, 'VOZ', 'TURNO');
  fs.mkdirSync(t, { recursive: true });
  const viejo = (mediodia().getTime() - (TURNO_ABANDONADO_S + 10) * 1000) / 1000;
  fs.utimesSync(t, viejo, viejo);
  assert.equal(await voz({ root, quien: 'sesion-a', texto: 'hola', ahora: mediodia, esperaMaxS: 3, dormir: async () => {}, hablar: async () => 'ok' }), 'ok');
});

test('en horas de silencio lo apunta en el registro', async () => {
  const root = tmp();
  await voz({ root, quien: 'sesion-a', texto: 'de noche', ahora: noche, hablar: async () => 'ok' });
  assert.match(registro(root), /sesion-a \(silencio\): de noche/);
});
