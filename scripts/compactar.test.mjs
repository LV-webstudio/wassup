// Pruebas de M64 (w compactar y w retomado) · node --test scripts/
// Sin datos reales: carpetas temporales, un repo de prueba y secretos montados por partes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compactandoDe, compactar, init, markReminded, register, remind, retomado, status, WassupError } from './wassup.mjs';

const SCRIPT = fileURLToPath(new URL('./wassup.mjs', import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-m64-'));
const github = ['gh', 'p_', 'A'.repeat(36)].join('');

function dos() {
  const root = tmp();
  init({ root, name: 'pc', lang: 'es' });
  register({ root, by: 'pc', name: 'mac' });
  init({ root, name: 'mac' });
  return root;
}

function memoria(texto = '# Retomar\nEstado a hoy. Siguiente paso: pruebas.\n') {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'retomar.md'), texto);
  fs.writeFileSync(path.join(dir, 'MEMORY.md'), '- [Retomar](retomar.md) — empieza aquí\n');
  return dir;
}

function repo() {
  const dir = tmp();
  const git = (...a) => execFileSync('git', ['-c', 'user.name=prueba', '-c', 'user.email=prueba@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  git('init', '-q');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git('add', '.');
  git('commit', '-q', '-m', 'uno');
  return { dir, head: git('rev-parse', '--short', 'HEAD') };
}

const buzon = (root, s) => fs.readFileSync(path.join(root, 'buzon', `${s}.md`), 'utf8');

test('se niega sin retomar.md o con uno de más de 30 min, y no marca ni avisa', () => {
  const root = dos();
  const vacia = tmp();
  assert.throws(() => compactar({ root, me: 'mac', memoria: vacia }), (e) => e instanceof WassupError && /falta retomar\.md/.test(e.es));
  const dir = memoria();
  const viejo = new Date(Date.now() - 45 * 60000);
  fs.utimesSync(path.join(dir, 'retomar.md'), viejo, viejo);
  assert.throws(() => compactar({ root, me: 'mac', memoria: dir }), (e) => /tiene 45 min \(como mucho 30\)/.test(e.es));
  assert.equal(compactandoDe(root, 'mac'), null);
  assert.ok(!buzon(root, 'mac').includes('compactando'));
});

test('con repo, retomar.md tiene que citar su commit; sin repo basta la fecha', () => {
  const root = dos();
  const r = repo();
  assert.throws(() => compactar({ root, me: 'mac', memoria: memoria(), repo: r.dir }), (e) => e.es.includes(`no cita el commit actual del repo (${r.head})`));
  const ok = compactar({ root, me: 'mac', memoria: memoria(`# Retomar\nRepo en ${r.head}, árbol limpio.\n`), repo: r.dir });
  assert.equal(ok.commit, r.head);
  retomado({ root, me: 'mac' });
  const sinRepo = compactar({ root, me: 'mac', memoria: memoria(), repo: tmp() });
  assert.equal(sinRepo.commit, null);
});

test('un secreto en la memoria lo para: fichero y línea, nunca el valor', () => {
  const root = dos();
  const dir = memoria();
  fs.writeFileSync(path.join(dir, 'notas.md'), `uno\ndos\n${github}\n`);
  try {
    compactar({ root, me: 'mac', memoria: dir });
    assert.fail('tenía que negarse');
  } catch (e) {
    assert.match(e.es, /^No compacto: hay un secreto en la memoria \(notas\.md, línea 3: token de GitHub\)/);
    assert.ok(!e.es.includes(github) && !e.en.includes(github), 'el error no lleva el valor');
  }
  assert.equal(compactandoDe(root, 'mac'), null);
  assert.ok(!buzon(root, 'mac').includes('compactando'));
});

test('compactar marca, avisa a la coordinadora y status lo enseña; retomado lo cierra y avisa', () => {
  const root = dos();
  const dir = memoria('# Retomar\nCliente con DNI 12345678Z (dato de prueba).\n');
  const now = new Date();
  const r = compactar({ root, me: 'mac', memoria: dir, now });
  assert.equal(r.n, 1);
  assert.deepEqual(r.avisos, [{ fichero: 'retomar.md', nivel: 'dato', tipo: 'dni', linea: 2 }]);
  assert.equal(compactandoDe(root, 'mac').desde, now.toISOString());
  const b = buzon(root, 'mac');
  assert.match(b, /Para: pc\n\*\*Asunto:\*\* compactando/);
  assert.match(b, /0 secretos, 1 datos personales/);
  assert.ok(!b.includes('12345678Z') && !b.includes(dir), 'el aviso no lleva el dato ni la ruta');
  assert.ok(!fs.readFileSync(path.join(root, 'compactando-mac.json'), 'utf8').includes(os.tmpdir()), 'la marca no guarda rutas');
  assert.equal(status({ root }).find((s) => s.session === 'mac').compactandoDesde, now.toISOString());
  const v = retomado({ root, me: 'mac', now: new Date(now.getTime() + 12 * 60000) });
  assert.deepEqual(v, { habia: true, min: 12, n: 2 });
  assert.match(buzon(root, 'mac'), /\*\*Asunto:\*\* retomado\n\nRetomado tras 12 min compactando\./);
  assert.equal(compactandoDe(root, 'mac'), null);
  assert.deepEqual(retomado({ root, me: 'mac' }), { habia: false });
});

test('más de 30 min compactando: remind avisa a la coordinadora y a la propia sesión, una vez', () => {
  const root = dos();
  const now = new Date();
  compactar({ root, me: 'mac', memoria: memoria(), now });
  const a29 = new Date(now.getTime() + 29 * 60000);
  const a31 = new Date(now.getTime() + 31 * 60000);
  assert.ok(!remind({ root, me: 'pc', now: a29 }).some((x) => x.kind === 'compactando'));
  const pc = remind({ root, me: 'pc', now: a31 }).filter((x) => x.kind === 'compactando');
  assert.deepEqual(pc.map((x) => [x.to, x.min]), [['mac', 31]]);
  assert.equal(remind({ root, me: 'mac', now: a31 }).filter((x) => x.kind === 'compactando').length, 1);
  markReminded({ root, me: 'pc', key: pc[0].key });
  assert.ok(!remind({ root, me: 'pc', now: a31 }).some((x) => x.kind === 'compactando'));
  retomado({ root, me: 'mac', now: a31 });
  assert.ok(!remind({ root, me: 'mac', now: a31 }).some((x) => x.kind === 'compactando'));
});

test('la coordinadora avisa a todas; sola, marca sin avisar', () => {
  const root = dos();
  assert.equal(compactar({ root, me: 'pc', memoria: memoria() }).n, 1);
  assert.match(buzon(root, 'pc'), /Para: todas\n\*\*Asunto:\*\* compactando/);
  const solo = tmp();
  init({ root: solo, name: 'pc', lang: 'es' });
  const r = compactar({ root: solo, me: 'pc', memoria: memoria() });
  assert.equal(r.n, null);
  assert.ok(compactandoDe(solo, 'pc'));
});

test('w compactar y w retomado por la línea de órdenes, en español; un secreto sale con 1', () => {
  const root = dos();
  const dir = memoria();
  const w = (...a) => execFileSync(process.execPath, [SCRIPT, ...a], { cwd: tmp(), stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  assert.match(w('compactar', '--root', root, '--me', 'mac', '--memoria', dir), /^ok · compactando · retomar\.md de 0 min · sin repo: basta la fecha · 2 ficheros barridos, 0 secretos · aviso #1 · al volver: w retomado/);
  assert.match(w('status', '--root', root), /mac .*COMPACTANDO 0 min/);
  assert.match(w('retomado', '--root', root, '--me', 'mac'), /^ok · retomado tras 0 min · aviso #2/);
  fs.writeFileSync(path.join(dir, 'clave.md'), `${github}\n`);
  let code = 0;
  let out = '';
  try {
    w('compactar', '--root', root, '--me', 'mac', '--memoria', dir, '--repo', 'none');
  } catch (e) {
    code = e.status;
    out = `${e.stdout}${e.stderr}`;
  }
  assert.equal(code, 1);
  assert.match(out, /wassup: No compacto: hay un secreto en la memoria \(clave\.md, línea 1: token de GitHub\)/);
  assert.ok(!out.includes(github));
});
