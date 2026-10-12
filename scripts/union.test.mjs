// Los programas de Wassup tienen que arrancar también llamados por una unión o un enlace simbólico
// (una carpeta de skills enlazada): sin rutas reales salían con 0 y en silencio, y el hook de claves no bloqueaba.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));

function enlazar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-union-'));
  const enlace = path.join(dir, 'scripts');
  try {
    fs.symlinkSync(scripts, enlace, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    return null;
  }
  return enlace;
}

test('voz, cuota, wassup-hooks y el hook de claves arrancan por una unión', (t) => {
  const enlace = enlazar();
  if (!enlace) return t.skip('no se puede crear la unión aquí');
  const run = (rel, args = [], input = '') => spawnSync(process.execPath, [path.join(enlace, rel), ...args], { input, encoding: 'utf8' });
  assert.equal(run('voz.mjs').status, 2, 'voz sin argumentos: uso y código 2');
  assert.equal(run('cuota.mjs', ['install']).status !== 0 || /root/.test(run('cuota.mjs', ['install']).stderr), true, 'cuota install sin --root no calla');
  const send = JSON.stringify({ tool_name: 'SendMessage', tool_input: { to: 'x', message: ['gh', 'p_', 'a'.repeat(36)].join('') } });
  const a = run(path.join('hooks', 'a-claves-sendmessage.mjs'), [], send);
  assert.match(a.stdout, /"deny"/, 'el hook de claves bloquea también por la unión');
  fs.rmSync(path.dirname(enlace), { recursive: true, force: true });
});
