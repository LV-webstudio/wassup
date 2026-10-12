// Pruebas de M67 («Prueba:» al decir que algo está hecho) · node --test "scripts/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configure, faltaPrueba, init, register, send, WassupError } from './wassup.mjs';

const SCRIPT = fileURLToPath(new URL('./wassup.mjs', import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-m67-'));

function dos() {
  const root = tmp();
  init({ root, name: 'pc', lang: 'es' });
  register({ root, by: 'pc', name: 'mac' });
  init({ root, name: 'mac' });
  return root;
}

test('la etiqueta vale en 7 idiomas, al principio de línea y con viñeta', () => {
  for (const et of ['Prueba', 'Proof', 'Prova', 'Preuve', 'Nachweis', 'Bewijs', 'Dowód']) {
    assert.equal(faltaPrueba(`Hecho el cambio.\n- ${et}: 81/81`).falta, false, et);
    assert.equal(faltaPrueba(`Hecho el cambio.\n${et} : 81/81`).falta, false, `${et} con espacio`);
  }
  assert.equal(faltaPrueba('Hecho. Sin más: Prueba: dentro de la frase no cuenta').falta, true);
});

test('las palabras disparadoras en 6 idiomas, como palabra entera y sin mayúsculas', () => {
  assert.deepEqual(faltaPrueba('Desplegado y comprobado.').palabras, ['desplegado', 'comprobado']);
  for (const frase of ['Done.', 'Feito.', 'Supprimé hier.', 'Pubblicato.', 'Erledigt.']) assert.equal(faltaPrueba(frase).falta, true, frase);
  assert.equal(faltaPrueba('Lo dejo deshecho y sin probar').falta, false, '«deshecho» no es «hecho»');
  assert.equal(faltaPrueba('Pregunta: ¿qué falta?').falta, false);
  assert.equal(faltaPrueba('Instalado, borrado, subido y aplicado').palabras.length, 3, 'como mucho 3');
});

test('send avisa por defecto y no bloquea; los avisos automáticos no se miran', () => {
  const root = dos();
  const r = send({ root, from: 'mac', to: 'pc', subject: 'G22', body: 'Hecho y subido.', comprobarPrueba: true });
  assert.equal(r.n, 1);
  assert.deepEqual(r.avisoPrueba, ['hecho', 'subido']);
  const con = send({ root, from: 'mac', to: 'pc', subject: 'G22', body: 'Hecho.\nPrueba: 6/6', comprobarPrueba: true });
  assert.equal(con.avisoPrueba, null);
  const auto = send({ root, from: 'mac', to: 'pc', subject: 'aviso', body: 'Hecho.' });
  assert.equal(auto.avisoPrueba, null, 'sin comprobarPrueba (avisos de Wassup) no se mira');
});

test('config --prueba estricta bloquea sin escribir; off no mira; un valor raro se rechaza', () => {
  const root = dos();
  configure({ root, by: 'pc', prueba: 'estricta' });
  const buzon = path.join(root, 'buzon', 'mac.md');
  const antes = fs.readFileSync(buzon, 'utf8');
  assert.throws(
    () => send({ root, from: 'mac', to: 'pc', subject: 'x', body: 'Desplegado.', comprobarPrueba: true }),
    (e) => e instanceof WassupError && /prueba estricta/.test(e.es) && /strict proof/.test(e.en),
  );
  assert.equal(fs.readFileSync(buzon, 'utf8'), antes);
  assert.equal(send({ root, from: 'mac', to: 'pc', subject: 'x', body: 'Desplegado.\nPrueba: /healthz ok', comprobarPrueba: true }).n, 1);
  assert.equal(configure({ root, by: 'pc', prueba: 'off' }).prueba, 'off');
  assert.equal(send({ root, from: 'mac', to: 'pc', subject: 'x', body: 'Desplegado.', comprobarPrueba: true }).avisoPrueba, null);
  assert.throws(() => configure({ root, by: 'pc', prueba: 'a-veces' }), /--prueba/);
});

test('w send por la línea de órdenes: el aviso sale en español y el envío se hace', () => {
  const root = dos();
  const r = spawnSync(process.execPath, [SCRIPT, 'send', '--root', root, '--from', 'mac', '--to', 'pc', '--subject', 'fin', '--body', 'Publicado.'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^ok · #1/);
  assert.match(r.stderr, /aviso · dice «publicado» sin una línea «Prueba:» \(M67\)/);
});
