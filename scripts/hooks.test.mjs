// Pruebas de wassup-hooks.mjs · node --test scripts/hooks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { init, register, send } from './wassup.mjs';
import { conHora, dejarAcuses, guardarOrden, horaSistema, main, revisarSecretos, sinAcuse } from './wassup-hooks.mjs';

const HOOKS = fileURLToPath(new URL('./wassup-hooks.mjs', import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-h-'));
function proyecto() {
  const root = tmp();
  init({ root, name: 'pc', lang: 'es' });
  for (const n of ['mac', 'pc2']) { register({ root, by: 'pc', name: n }); init({ root, name: n }); }
  return root;
}

test('acuse: el receptor deja RECIBIDO y el emisor lista las órdenes sin acuse', () => {
  const root = proyecto();
  send({ root, from: 'pc', to: 'mac', subject: 'Hola', body: 'x', commit: 'none' });
  send({ root, from: 'pc', to: 'all', subject: 'Todas', body: 'y', commit: 'none' });
  assert.equal(sinAcuse({ root, me: 'pc' }).length, 2);
  assert.deepEqual(dejarAcuses({ root, me: 'mac' }), ['pc#1', 'pc#2']);
  assert.deepEqual(dejarAcuses({ root, me: 'mac' }), []); // idempotente
  assert.ok(fs.readFileSync(path.join(root, 'ACUSES', 'RECIBIDO-pc-1-mac.txt'), 'utf8').startsWith('RECIBIDO pc#1'));
  assert.deepEqual(sinAcuse({ root, me: 'pc' }).map((f) => [f.id, f.faltan]), [['pc#2', ['pc2']]]);
  dejarAcuses({ root, me: 'pc2' });
  assert.deepEqual(sinAcuse({ root, me: 'pc' }), []);
  assert.deepEqual(dejarAcuses({ root, me: 'pc' }), []); // no se acusa a sí mismo
});

test('ordenes: copia fecha, sesión, texto y firma; un secreto pegado no se copia', () => {
  const root = proyecto();
  const f = guardarOrden({ root, sesion: 'mac', texto: 'Despliega la rama nueva', now: new Date(2026, 9, 11, 9, 30, 5) });
  const t = fs.readFileSync(f, 'utf8');
  assert.match(path.basename(f), /^20261011-093005-mac-[0-9a-f]{6}\.md$/);
  assert.match(t, /fecha: 2026-10-11 09:30/);
  assert.match(t, /sesión: mac/);
  assert.match(t, /firma: [0-9a-f]{16}/);
  assert.match(t, /Despliega la rama nueva/);
  const g = guardarOrden({ root, sesion: 'mac', texto: 'usa ghp_abcdefghijklmnop1234 ya' });
  assert.ok(!fs.readFileSync(g, 'utf8').includes('ghp_abcdefghij'));
  assert.equal(guardarOrden({ root, sesion: 'mac', texto: '  ' }), null);
});

test('secretos: bloquea tokens, claves y contraseñas; deja pasar texto normal', () => {
  for (const s of ['mi clave: hunter22xx', 'password=abcdef12', 'ghp_abcdefghijklmnop1234', '-----BEGIN RSA PRIVATE KEY-----', 'AKIAABCDEFGH12345678'])
    assert.equal(revisarSecretos({ message: s }).bloquear, true, s);
  for (const s of ['Hola, revisa el #4 y despliega', 'la clave del problema es el orden', 'commit abc1234'])
    assert.equal(revisarSecretos({ message: s }).bloquear, false, s);
});

test('hora: se añade una vez, con formato fijo', () => {
  const d = new Date(2026, 9, 11, 9, 30);
  assert.match(horaSistema(d), /^2026-10-11 09:30 [+-]\d\d:\d\d$/);
  const a = conHora({ to: 'mac', message: 'Hola' }, d);
  assert.match(a.message, /^Hola\n\n\[hora: 2026-10-11 09:30 [+-]\d\d:\d\d\]$/);
  assert.equal(a.to, 'mac');
  assert.equal(conHora(a, d), null);
  assert.equal(conHora({ to: 'x' }, d), null);
});

test('CLI: secretos sale 2 con motivo; hora devuelve updatedInput; sin carpeta no hace nada', async () => {
  const root = proyecto();
  const ev = (o) => JSON.stringify({ tool_name: 'SendMessage', tool_input: o });
  const r = await main(['secretos', '--root', root], ev({ message: 'password: secreto123' }));
  assert.equal(r.code, 2);
  assert.match(r.stderr, /bloquea/);
  assert.equal((await main(['secretos', '--root', root], ev({ message: 'hola' }))).code, 0);
  const h = JSON.parse((await main(['hora', '--root', root], ev({ message: 'hola' }))).stdout);
  assert.equal(h.hookSpecificOutput.permissionDecision, 'allow');
  assert.match(h.hookSpecificOutput.updatedInput.message, /\[hora: /);
  assert.deepEqual(await main(['secretos'], ev({ message: 'password: secreto123' }), {}), { code: 0 });
  const p = spawnSync(process.execPath, [HOOKS, 'secretos', '--root', root], { input: ev({ message: 'ghp_abcdefghijklmnop1234' }), encoding: 'utf8' });
  assert.equal(p.status, 2);
});
