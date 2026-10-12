// Pruebas de la 0.12 (senado del 02-10-2026): versión en el buzón (A6), red y apagados (A7), latido (A8),
// decisiones (A1), huellas (A5) y avisos conocidos (A18) · node --test "scripts/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  avisosNuevos, configure, esDecision, health, huellas, init, ipPrivada, minutosSinNoticias, parseMailbox, red, redOf,
  register, retomado, send, status, unread, VERSION, versionesMezcladas, versionOf,
} from './wassup.mjs';

const SCRIPT = fileURLToPath(new URL('./wassup.mjs', import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-012-'));
const w = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: 'utf8' });
const buzon = (root, n) => fs.readFileSync(path.join(root, 'buzon', `${n}.md`), 'utf8');
const dos = () => {
  const root = tmp();
  init({ root, name: 'pc', lang: 'es', maquina: 'pc-casa', redIp: '192.0.2.10' });
  register({ root, by: 'pc', name: 'mac' });
  init({ root, name: 'mac', maquina: 'mac-oficina', redIp: '192.0.2.41' });
  return root;
};
// (b) del sesion-qa: la red va APAGADA por defecto; estas pruebas la encienden para el proyecto.
const dosConRed = () => {
  const root = tmp();
  init({ root, name: 'pc', lang: 'es', maquina: 'pc-casa', redIp: '192.0.2.10' });
  configure({ root, by: 'pc', red: 'on' });
  init({ root, name: 'pc', lang: 'es', maquina: 'pc-casa', redIp: '192.0.2.10' });
  register({ root, by: 'pc', name: 'mac' });
  init({ root, name: 'mac', maquina: 'mac-oficina', redIp: '192.0.2.41' });
  return root;
};
const sample = { equipoId: 'aaaa0001', so: 'linux', nucleos: 4, ramTotalGB: 8, ramGB: 4, swapGB: 0, carga: 0.2, repoGB: 50, compartidaGB: 50, termica: { estado: 'ok' }, vmMemGB: null };

test('A6 · la versión va en el buzón (init y send) y se avisa si conviven versiones', () => {
  const root = dos();
  assert.equal(versionOf(buzon(root, 'pc')), VERSION);
  assert.deepEqual(versionesMezcladas(root, 'pc'), []);
  // Un buzón de ≤ 0.11 (sin la línea) cuenta como versión distinta.
  const f = path.join(root, 'buzon', 'mac.md');
  fs.writeFileSync(f, buzon(root, 'mac').replace(/^Wassup: .+\n/m, ''));
  assert.deepEqual(versionesMezcladas(root, 'pc'), [{ sesion: 'mac', version: null }]);
  const r = send({ root, from: 'pc', to: 'mac', subject: 'hola', body: 'prueba' });
  assert.deepEqual(r.versiones, [{ sesion: 'mac', version: null }], 'send avisa');
  // Una vez al día por sesión: el segundo envío del mismo día no repite el aviso.
  assert.deepEqual(send({ root, from: 'pc', to: 'mac', subject: 'otra', body: 'prueba' }).versiones, [], 'no se repite');
  assert.deepEqual(versionesMezcladas(root, 'pc'), [{ sesion: 'mac', version: null }], 'pero la mezcla sigue ahí (health y status la dicen)');
  // El envío de mac pone su línea al día.
  send({ root, from: 'mac', to: 'pc', subject: 'hola', body: 'prueba' });
  assert.equal(versionOf(buzon(root, 'mac')), VERSION);
  assert.deepEqual(versionesMezcladas(root, 'pc'), []);
  // Los mensajes siguen leyéndose igual.
  assert.equal(parseMailbox(buzon(root, 'pc')).length, 2);
});

test('A7 · red: apagada por defecto (no escribe la IP); encendida, IP privada y hora del sistema; --apago; init y retomado', () => {
  const sin = dos();
  assert.equal(redOf(buzon(sin, 'pc')), null, 'por defecto no se escribe la IP en la carpeta compartida');
  assert.equal(red({ root: sin, me: 'pc', ip: '192.0.2.10' }).apagada, true);
  assert.equal(status({ root: sin }).find((s) => s.session === 'pc').red, null);
  const root = dosConRed();
  assert.deepEqual(redOf(buzon(root, 'pc')).ip, '192.0.2.10');
  assert.equal(redOf(buzon(root, 'pc')).estado, 'encendido');
  const r = red({ root, me: 'pc', apago: '23:30', ip: '192.0.2.11', now: new Date(2026, 9, 2, 22, 0) });
  assert.equal(r.estado, 'se apaga a las 23:30');
  assert.match(buzon(root, 'pc'), /^Red: 192.0.2.11 · 2026-10-02 22:00 [+-]\d\d:\d\d · se apaga a las 23:30$/m);
  assert.throws(() => red({ root, me: 'pc', apago: 'luego' }), /HH:MM/);
  // Solo IPv4 privada; nunca la pública ni la interna.
  assert.equal(ipPrivada({ lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }], eth: [{ family: 'IPv4', internal: false, address: '8.8.8.8' }, { family: 'IPv6', internal: false, address: 'fe80::1' }] }), null);
  assert.equal(ipPrivada({ wifi: [{ family: 'IPv4', internal: false, address: '172.20.0.5' }] }), '172.20.0.5');
  // Con una máquina virtual o una VPN encendidas, gana la interfaz física (revisión de QA, MEDIA 7a).
  assert.equal(ipPrivada({ 'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.29.16.1' }], docker0: [{ family: 'IPv4', internal: false, address: '172.17.0.1' }], 'Wi-Fi': [{ family: 'IPv4', internal: false, address: '192.168.50.20' }] }), '192.168.50.20');
  assert.equal(ipPrivada({ utun3: [{ family: 'IPv4', internal: false, address: '10.8.0.2' }], en0: [{ family: 'IPv4', internal: false, address: '10.0.0.7' }] }), '10.0.0.7');
  // retomado la pone al día (aunque no hubiera compactación abierta).
  fs.writeFileSync(path.join(root, 'buzon', 'pc.md'), buzon(root, 'pc').replace(/^Red: .+\n/m, ''));
  assert.equal(retomado({ root, me: 'pc' }).habia, false);
  assert.ok(redOf(buzon(root, 'pc')), 'retomado vuelve a escribir la red');
  // status la enseña mientras está encendida.
  assert.equal(status({ root }).find((s) => s.session === 'mac').red.ip, '192.0.2.41');
  // config --red off: no se escribe y status deja de enseñarla.
  configure({ root, by: 'pc', red: 'off' });
  assert.equal(red({ root, me: 'pc' }).apagada, true);
  assert.equal(status({ root }).find((s) => s.session === 'mac').red, null);
});

test('A8 · latido: minutos sin noticias por lo más reciente (red, último mensaje o salud)', () => {
  const now = new Date('2026-10-02T20:00:00Z');
  assert.equal(minutosSinNoticias({ red: { ts: '2026-10-02 21:00 +02:00' }, lastDate: '2026-10-02 18:00 +02:00', healthTs: null }, now), 60);
  assert.equal(minutosSinNoticias({ red: null, lastDate: null, healthTs: '2026-10-02T19:30:00Z' }, now), 30);
  assert.equal(minutosSinNoticias({ red: null, lastDate: null, healthTs: null }, now), null);
  const root = dosConRed();
  configure({ root, by: 'pc', latido: 120 });
  assert.throws(() => configure({ root, by: 'pc', latido: 2 }), /5 or more/);
  assert.equal(typeof status({ root })[0].sinNoticiasMin, 'number');
});

test('A1 · «decision:» marca un mensaje como decisión; unread la lleva marcada', () => {
  assert.equal(esDecision('decision: todas como mucho solo calle'), true);
  assert.equal(esDecision('Decisión: sí'), true);
  assert.equal(esDecision('sobre la decisión de ayer'), false);
  const root = dos();
  const r = send({ root, from: 'pc', to: 'mac', subject: 'decisión: «YO VOTO SI» (titular, 02-10)', body: 'cita literal' });
  assert.equal(r.decision, true);
  const u = unread({ root, me: 'mac' });
  assert.equal(u[0].messages[0].decision, true);
  const salida = w('unread', '--root', root, '--me', 'mac', '--resumen');
  assert.match(salida.stdout, /⚑ DECISIÓN · pc#1/);
});

test('A5 · huellas: sella si no hay, comprueba si hay, NUNCA reescribe sin --sellar', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'uno');
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'b.mjs'), 'dos');
  const s = huellas({ carpeta: dir });
  assert.equal(s.modo, 'sellado');
  assert.equal(s.ficheros, 2);
  assert.match(fs.readFileSync(path.join(dir, 'HUELLAS.txt'), 'utf8'), /^[0-9a-f]{64} \*sub\/b\.mjs$/m);
  assert.equal(huellas({ carpeta: dir }).ok, true);
  // Un cambio, uno que falta y uno nuevo: lo dice y no toca HUELLAS.txt.
  const antes = fs.readFileSync(path.join(dir, 'HUELLAS.txt'), 'utf8');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'cambiado');
  fs.rmSync(path.join(dir, 'sub', 'b.mjs'));
  fs.writeFileSync(path.join(dir, 'c.md'), 'nuevo');
  const c = huellas({ carpeta: dir });
  assert.deepEqual([c.ok, c.distintos, c.faltan, c.nuevos], [false, ['a.txt'], ['sub/b.mjs'], ['c.md']]);
  assert.equal(fs.readFileSync(path.join(dir, 'HUELLAS.txt'), 'utf8'), antes, 'HUELLAS.txt intacto');
  const cli = w('huellas', dir, '--lang', 'es');
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /NO COINCIDE.*--sellar/);
  // Con --sellar, sí.
  assert.equal(huellas({ carpeta: dir, sellar: true }).modo, 'sellado');
  assert.equal(huellas({ carpeta: dir }).ok, true);
  assert.throws(() => huellas({ carpeta: path.join(dir, 'no-existe') }), /existing folder/);
  // Una línea con ruta fuera de la carpeta no cuenta como «falta»: se dice aparte.
  fs.appendFileSync(path.join(dir, 'HUELLAS.txt'), `${'0'.repeat(64)} *../otra-carpeta/x.txt\n`);
  const f = huellas({ carpeta: dir });
  assert.deepEqual([f.ok, f.fuera, f.faltan], [true, ['../otra-carpeta/x.txt'], []]);
});

test('A15 · la hora del mensaje lleva su zona, sola (ya desde M35)', async () => {
  const root = dos();
  send({ root, from: 'pc', to: 'mac', subject: 'hora', body: 'prueba', now: new Date(2026, 9, 2, 23, 5) });
  assert.match(buzon(root, 'pc'), /^## #1 · 2026-10-02 23:05 [+-]\d\d:\d\d · Para: mac$/m);
});

test('A18 · AVISOS.md: health enseña solo los avisos nuevos desde la última vez', async () => {
  const root = dos();
  assert.deepEqual(avisosNuevos(root), { total: 0, nuevos: [] });
  fs.writeFileSync(path.join(root, 'AVISOS.md'), '# Avisos conocidos\n- JAVA_TOOL_OPTIONS rompe el emulador de Firestore\n');
  const h1 = await health({ root, me: 'mac', sample, send: false });
  assert.deepEqual(h1.avisosNuevos, ['JAVA_TOOL_OPTIONS rompe el emulador de Firestore']);
  const h2 = await health({ root, me: 'mac', sample, send: false });
  assert.deepEqual(h2.avisosNuevos, [], 'ya visto');
  fs.appendFileSync(path.join(root, 'AVISOS.md'), '- otro aviso\n');
  const h3 = await health({ root, me: 'mac', sample, send: false });
  assert.deepEqual(h3.avisosNuevos, ['otro aviso']);
  assert.deepEqual(h3.versiones, []);
});
