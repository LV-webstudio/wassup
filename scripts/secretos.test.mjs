// Pruebas de M51 (secretos y datos personales) · node --test scripts/
// Los secretos de prueba se montan por partes para que ningún barrido los tome por reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validarCaps, barrer, configure, detectar, ibanValido, init, logIncident, register, send, status, unread, WassupError } from './wassup.mjs';

const SCRIPT = fileURLToPath(new URL('./wassup.mjs', import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-m51-'));
const x = (n, c = 'a') => c.repeat(n);
const F = {
  pem: ['-----BEGIN ', 'RSA PRIVATE KEY-----\nMIIEow', x(40, 'Q'), '\n-----END RSA PRIVATE KEY-----'].join(''),
  pem8: ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
  cuenta: ['{"type": "service', '_account", "project_id": "demo"}'].join(''),
  privateKey: ['"private', '_key": "', x(30, 'M'), '"'].join(''),
  github: ['gh', 'p_', x(36, 'A')].join(''),
  aws: ['AK', 'IA', x(16, 'B')].join(''),
  google: ['AI', 'za', x(35, 'c')].join(''),
  anthropic: ['sk-', 'ant-', 'api03-', x(30, 'd')].join(''),
  jwt: ['ey', 'J', x(12, 'h'), '.ey', 'J', x(12, 'p'), '.', x(12, 's')].join(''),
  asignacion: ['api', '_key = "', 'Zq9', x(20, 'k'), '"'].join(''),
};

function dos() {
  const root = tmp();
  init({ root, name: 'pc', lang: 'es' });
  register({ root, by: 'pc', name: 'mac' });
  init({ root, name: 'mac' });
  return root;
}

test('detecta los secretos evidentes, con la línea y sin el valor', () => {
  for (const [nombre, valor] of Object.entries(F)) {
    const h = detectar(`hola\n${valor}\nadiós`);
    assert.ok(h.some((y) => y.nivel === 'secreto' && y.linea === 2), nombre);
    assert.ok(!JSON.stringify(h).includes(valor.slice(-10)), `${nombre}: no lleva el valor`);
  }
});

test('no confunde hashes ni frases que solo hablan de claves', () => {
  const texto = [
    'commit 51b40f7a9c2e4d6b8f0a1c3e5d7b9f1a3c5e7d9b',
    'SHA-256 f1808a60d2c4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d261d6',
    'La API key está en la ruta local; password: la de siempre.',
    'token: pendiente · clave privada por USB cifrado',
    'Teléfono del Mac: ninguno · 12345678 sin letra',
  ].join('\n');
  assert.deepEqual(detectar(texto), []);
});

test('DNI, NIE e IBAN solo cuentan si pasan su control, y son avisos', () => {
  assert.deepEqual(detectar('DNI 12345678Z'), [{ nivel: 'dato', tipo: 'dni', linea: 1 }]);
  assert.deepEqual(detectar('DNI 12345678A'), []);
  assert.deepEqual(detectar('NIE X-1234567-L'), [{ nivel: 'dato', tipo: 'nie', linea: 1 }]);
  assert.deepEqual(detectar('NIE X1234567A'), []);
  assert.ok(ibanValido('ES91 2100 0418 4502 0005 1332'));
  assert.ok(!ibanValido('ES92 2100 0418 4502 0005 1332'));
  assert.deepEqual(detectar('\nIBAN ES91 2100 0418 4502 0005 1332 OK'), [{ nivel: 'dato', tipo: 'iban', linea: 2 }]);
  assert.deepEqual(detectar('ES9121000418450200051332'), [{ nivel: 'dato', tipo: 'iban', linea: 1 }]);
  assert.deepEqual(detectar('ES92 2100 0418 4502 0005 1332'), []);
});

test('send bloquea un secreto en el cuerpo, el asunto o lo que espera, y no escribe nada', () => {
  const root = dos();
  const buzon = path.join(root, 'buzon', 'pc.md');
  const antes = fs.readFileSync(buzon, 'utf8');
  for (const campos of [{ body: `la clave:\n${F.github}` }, { subject: F.aws }, { expect: F.anthropic }]) {
    const e = assert.throws(
      () => send({ root, from: 'pc', to: 'mac', subject: 'x', body: 'y', ...campos }),
      (err) => err instanceof WassupError && /^Blocked/.test(err.message) && /^Bloqueado/.test(err.es),
    );
    void e;
  }
  try {
    send({ root, from: 'pc', to: 'mac', subject: 'x', body: `uno\n${F.github}` });
  } catch (err) {
    assert.match(err.es, /--body, línea 2: token de GitHub/);
    assert.ok(!err.es.includes(F.github) && !err.en.includes(F.github), 'el error no lleva el valor');
  }
  assert.equal(fs.readFileSync(buzon, 'utf8'), antes);
});

test('send con un DNI válido envía y devuelve el aviso', () => {
  const root = dos();
  const r = send({ root, from: 'pc', to: 'mac', subject: 'alta', body: 'cliente con DNI 12345678Z', campoCuerpo: '--body-file' });
  assert.equal(r.n, 1);
  assert.deepEqual(r.avisos, [{ nivel: 'dato', tipo: 'dni', linea: 1, campo: '--body-file' }]);
});

test('unread y status señalan un secreto ya escrito a mano, con fichero y línea, sin el valor', () => {
  const root = dos();
  send({ root, from: 'pc', to: 'mac', subject: 'limpio', body: 'nada raro' });
  const buzon = path.join(root, 'buzon', 'pc.md');
  fs.appendFileSync(buzon, `\n## #2 · 2026-10-01 20:00 +02:00 · Para: mac\n**Asunto:** a mano\n\n${F.pem8}\n\n---\n`);
  const u = unread({ root, me: 'mac' });
  assert.equal(u[0].messages.length, 2);
  assert.equal(u[0].avisos.length, 1);
  const av = u[0].avisos[0];
  assert.equal(av.n, 2);
  assert.equal(av.fichero, buzon);
  assert.equal(fs.readFileSync(buzon, 'utf8').replace(/\r\n/g, '\n').split('\n')[av.linea - 1], F.pem8);
  assert.ok(!JSON.stringify(u.map((y) => y.avisos)).includes('PRIVATE KEY'));
  const s = status({ root }).find((y) => y.session === 'pc');
  assert.equal(s.avisos.length, 1);
  assert.equal(s.avisos[0].tipo, 'clave-privada');
});

test('log bloquea un secreto y avisa de un DNI', () => {
  const root = dos();
  configure({ root, by: 'pc', incidents: 'on' });
  assert.throws(() => logIncident({ root, me: 'pc', tipo: 'idea', texto: `usa ${F.google}` }), /Blocked/);
  assert.ok(!fs.existsSync(path.join(root, 'incidencias', 'pc.jsonl')));
  const e = logIncident({ root, me: 'pc', tipo: 'idea', texto: 'el DNI 12345678Z no debería ir aquí' });
  assert.equal(e.avisos[0].tipo, 'dni');
});

test('w barrer: recorre la carpeta sin .git ni node_modules ni binarios; sale con 1 si hay secretos', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.git'));
  fs.mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'memoria'));
  fs.writeFileSync(path.join(dir, '.git', 'config'), F.github);
  fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'a.js'), F.github);
  fs.writeFileSync(path.join(dir, 'binario.bin'), Buffer.from([0, 1, 2, 3]));
  fs.writeFileSync(path.join(dir, 'memoria', 'retomar.md'), `# Retomar\nok\n${F.cuenta}\n`);
  fs.writeFileSync(path.join(dir, 'clientes.md'), 'IBAN ES91 2100 0418 4502 0005 1332\n');
  const r = barrer({ carpeta: dir });
  assert.equal(r.ficheros, 2);
  assert.equal(r.saltados, 1);
  assert.deepEqual(r.hallazgos, [
    { fichero: 'clientes.md', nivel: 'dato', tipo: 'iban', linea: 1 },
    { fichero: 'memoria/retomar.md', nivel: 'secreto', tipo: 'cuenta-de-servicio', linea: 3 },
  ]);
  let out = '';
  let code = 0;
  try {
    execFileSync(process.execPath, [SCRIPT, 'barrer', dir, '--lang', 'es'], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    code = err.status;
    out = `${err.stdout}${err.stderr}`;
  }
  assert.equal(code, 1);
  assert.match(out, /SECRETO · memoria\/retomar\.md, línea 3: JSON de cuenta de servicio/);
  assert.match(out, /aviso · clientes\.md, línea 1: IBAN/);
  assert.ok(!out.includes('service_account') && !out.includes('2100 0418'), 'la salida no lleva el valor');
  fs.rmSync(path.join(dir, 'memoria', 'retomar.md'));
  const ok = execFileSync(process.execPath, [SCRIPT, 'barrer', dir, '--lang', 'es'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  assert.match(ok, /^ok · 1 ficheros · 0 secretos · 1 datos personales/);
});

test('B-1 · init --caps: nombres y cred:<proyecto> sí; nada con aspecto de clave, token o contraseña', () => {
  for (const ok of ['playwright, safari', 'cred:mi-proyecto', 'playwright, cred:demo-web'])
    assert.doesNotThrow(() => validarCaps(ok), ok);
  for (const malo of ['cred:EJEMPLO-CLAVE-123', 'cred:token-abc', 'cred:mi-proyecto-pass', 'cred:', 'otra:cosa', 'sk-' + 'ant-EJEMPLOEJEMPLOEJEMPLOEJEMPLO'])
    assert.throws(() => validarCaps(malo), /--caps/, malo);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-caps-'));
  assert.throws(() => init({ root, name: 'pc', caps: 'cred:EJEMPLO-CLAVE-123' }), /--caps/);
  assert.equal(fs.existsSync(path.join(root, 'wassup.json')), false, 'no escribe nada si se niega');
  fs.rmSync(root, { recursive: true, force: true });
});
