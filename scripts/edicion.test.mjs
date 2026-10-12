// Pruebas del punto de extensión (0.11-b): el núcleo solo es la Básica; con wassup-completa.mjs al lado, la Completa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-ed-'));

/** Una carpeta con el núcleo solo (la Básica) y un proyecto con una sesión. */
function basica() {
  const dir = tmp();
  fs.copyFileSync(path.join(AQUI, 'wassup.mjs'), path.join(dir, 'wassup.mjs'));
  const root = tmp();
  const w = (...a) => spawnSync(process.execPath, [path.join(dir, 'wassup.mjs'), ...a], { encoding: 'utf8' });
  assert.equal(w('init', '--root', root, '--name', 'pc', '--lang', 'es', '--maquina', 'pc-pruebas').status, 0);
  return { w, root };
}

test('Básica: lock, unlock, run y awake avisan de que son de la Completa, sin escribir nada', () => {
  const { w, root } = basica();
  for (const orden of [['lock'], ['unlock'], ['awake'], ['run', '--tipo', 'build', '--', 'node', '-v']]) {
    const r = w(orden[0], '--root', root, '--me', 'pc', ...orden.slice(1));
    assert.equal(r.status, 1, orden[0]);
    assert.match(r.stderr, /es de la edición Completa de Wassup y aquí no está instalada/, orden[0]);
  }
  assert.ok(!fs.existsSync(path.join(root, 'cerrojos')), 'no crea cerrojos');
});

test('Básica: health --wait-ok, --repo y --report también; health a secas funciona', () => {
  const { w, root } = basica();
  for (const extra of [['--wait-ok'], ['--repo', root], ['--report']]) {
    const r = w('health', '--root', root, '--me', 'pc', '--quiet', ...extra);
    assert.match(r.stderr, /edición Completa/, extra[0]);
  }
  const ok = w('health', '--root', root, '--me', 'pc', '--json');
  assert.ok([0, 1, 2].includes(ok.status), 'código de salud');
  assert.ok(JSON.parse(ok.stdout).estado);
});

test('Básica: la ayuda y status no hablan de lo que no hay; la Completa sí', () => {
  const { w, root } = basica();
  const ayuda = w('help').stdout;
  assert.doesNotMatch(ayuda, /\bawake\b|\block\b|Completa \(Shania Webstudio\)/);
  assert.doesNotMatch(w('status', '--root', root).stdout, /despierto/);
  // Donde está la Completa (rama main), su ayuda se suma; en la Básica este fichero no existe.
  if (fs.existsSync(path.join(AQUI, 'wassup-completa.mjs'))) {
    const completa = spawnSync(process.execPath, [path.join(AQUI, 'wassup.mjs'), 'help'], { encoding: 'utf8' }).stdout;
    assert.match(completa, /Completa \(Shania Webstudio\):[\s\S]*awake[\s\S]*lock/);
  }
});

test('el núcleo no importa la Completa por su nombre fuera del punto de extensión', () => {
  const src = fs.readFileSync(path.join(AQUI, 'wassup.mjs'), 'utf8');
  assert.doesNotMatch(src, /^import .*wassup-completa/m);
  assert.equal(src.match(/wassup-completa\.mjs/g).length, 2, 'solo en el comentario y en cargarCompleta');
});
