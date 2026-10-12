// Pruebas de M69 (la máquina se declara con init --maquina; nunca se lee del sistema) · node --test "scripts/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { equipoDe, init, maquinaDe, measure, register, status, WassupError } from './wassup.mjs';

const SCRIPT = fileURLToPath(new URL('./wassup.mjs', import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-m69-'));
const h8 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
const w = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: 'utf8' });

test('init --maquina la guarda en el buzón; status la enseña; un nombre raro se rechaza', () => {
  const root = tmp();
  const r = init({ root, name: 'pc', lang: 'es', maquina: 'pc-casa' });
  assert.equal(r.maquina, 'pc-casa');
  assert.match(fs.readFileSync(path.join(root, 'buzon', 'pc.md'), 'utf8'), /^Máquina: pc-casa$/m);
  assert.equal(maquinaDe(root, 'pc'), 'pc-casa');
  assert.equal(status({ root })[0].maquina, 'pc-casa');
  assert.throws(() => init({ root, name: 'pc', maquina: 'PC de Ana' }), (e) => e instanceof WassupError && /sin nombres de personas/.test(e.es));
  // Volver a hacer init sin --maquina no la borra.
  init({ root, name: 'pc' });
  assert.equal(maquinaDe(root, 'pc'), 'pc-casa');
});

test('el id del equipo es el hash de la máquina declarada, nunca el nombre del sistema', async () => {
  const root = tmp();
  init({ root, name: 'pc', lang: 'es', maquina: 'pc-casa' });
  register({ root, by: 'pc', name: 'mac' });
  init({ root, name: 'mac' });
  assert.equal(equipoDe(root, 'pc'), h8('pc-casa'));
  assert.equal(equipoDe(root, 'mac'), h8('sin-maquina'), 'sin declarar: «sin-maquina»');
  assert.notEqual(equipoDe(root, 'pc'), h8(os.hostname()));
  const osm = { release: () => 'x', cpus: () => [1], totalmem: () => 8 * 1024 ** 3, freemem: () => 4 * 1024 ** 3, loadavg: () => [0, 0, 0], hostname: () => { throw new Error('no se debe leer el nombre del sistema'); } };
  const s = await measure({ root, repo: root, platform: 'linux', run: () => { throw new Error('sin órdenes'); }, osm, env: {}, maquina: 'pc-casa' });
  assert.equal(s.equipoId, h8('pc-casa'));
});

test('w init sin --maquina se niega (salvo que el buzón ya la tenga), en español', () => {
  const root = tmp();
  const no = w('init', '--root', root, '--name', 'pc', '--lang', 'es');
  assert.equal(no.status, 1);
  assert.match(no.stderr, /Falta --maquina <nombre>/);
  assert.ok(!fs.existsSync(path.join(root, 'wassup.json')), 'no escribe nada');
  assert.equal(w('init', '--root', root, '--name', 'pc', '--lang', 'es', '--maquina', 'pc-casa').status, 0);
  const otra = w('init', '--root', root, '--name', 'pc');
  assert.equal(otra.status, 0, 'con la máquina ya declarada, no hace falta repetirla');
  assert.match(otra.stdout, /máquina: pc-casa/);
});
