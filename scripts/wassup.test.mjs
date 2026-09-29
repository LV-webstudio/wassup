// Pruebas de wassup.mjs · node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ack, closeAll, configure, init, markReminded, parseAcks, parseMailbox, parseStamp, register, remind, replyNumbers, send, status, unread, wait, WassupError } from './wassup.mjs';

const SCRIPT = fileURLToPath(new URL('./wassup.mjs', import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-'));
const NOW = new Date(2026, 8, 28, 21, 45);

/** pc crea la carpeta (coordinador), registra a las demás y cada una hace su init. */
function three(lang = 'es') {
  const root = tmp();
  init({ root, name: 'pc', lang });
  for (const n of ['mac', 'pc2']) {
    register({ root, by: 'pc', name: n });
    init({ root, name: n });
  }
  return root;
}

test('init crea carpetas, buzón y estado; es idempotente', () => {
  const root = three();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'wassup.json'), 'utf8')).sessions, ['pc', 'mac', 'pc2']);
  assert.ok(fs.existsSync(path.join(root, 'buzon', 'mac.md')));
  assert.ok(fs.existsSync(path.join(root, 'ESTADO-mac.md')));
  assert.ok(fs.existsSync(path.join(root, 'desde-mac')));
  init({ root, name: 'mac' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'wassup.json'), 'utf8')).sessions.length, 3);
  assert.throws(() => init({ root, name: 'Mal Nombre' }), WassupError);
});

test('solo el coordinador registra sesiones; una sin registrar no puede hacer init', () => {
  const root = three();
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'wassup.json'), 'utf8')).coordinator, 'pc');
  assert.throws(() => init({ root, name: 'intrusa' }), /not registered/);
  assert.throws(() => register({ root, by: 'mac', name: 'otra' }), /coordinator/);
  assert.deepEqual(register({ root, by: 'pc', name: 'otra' }), ['pc', 'mac', 'pc2', 'otra']);
});

test('cada sesión apunta su nombre de ListAgents en su propio buzón y status lo muestra', () => {
  const root = three();
  init({ root, name: 'mac', agent: 'my-project-mac-92' });
  init({ root, name: 'mac', agent: 'mac-tests' });
  const mac = fs.readFileSync(path.join(root, 'buzon', 'mac.md'), 'utf8');
  assert.equal(mac.match(/^Sesión de Claude Code: .*$/gm).length, 1);
  const s = status({ root });
  assert.deepEqual(s.map((x) => [x.session, x.agent, x.coordinator]), [['pc', null, true], ['mac', 'mac-tests', false], ['pc2', null, false]]);
});

test('wait devuelve lo nuevo en cuanto llega, o nada al agotar el tiempo', async () => {
  const root = three();
  assert.deepEqual(await wait({ root, me: 'mac', timeout: 0.2, interval: 0.1 }), []);
  setTimeout(() => send({ root, from: 'pc', to: 'mac', subject: 'Ya', body: 'x' }), 150);
  const r = await wait({ root, me: 'mac', timeout: 5, interval: 0.1 });
  assert.equal(r[0].messages[0].subject, 'Ya');
});

test('sin --commit no pone commit; con uno explícito, sí', () => {
  const root = three();
  send({ root, from: 'pc', to: 'mac', subject: 'a', body: 'x', now: NOW });
  send({ root, from: 'pc', to: 'mac', subject: 'b', body: 'x', commit: 'abc1234', now: NOW });
  const t = fs.readFileSync(path.join(root, 'buzon', 'pc.md'), 'utf8');
  assert.match(t, /^## #1 · 2026-09-28 21:45 · Para: mac$/m);
  assert.match(t, /^## #2 · 2026-09-28 21:45 · commit abc1234 · Para: mac$/m);
});

test('send numera por remitente y deja el formato del buzón', () => {
  const root = three();
  const a = send({ root, from: 'pc', to: 'mac', subject: 'Primero', body: 'Hola', commit: 'abc1234', now: NOW });
  const b = send({ root, from: 'pc', to: 'todas', subject: 'Segundo', body: 'A todas', expect: 'nada', commit: 'none', now: NOW });
  const c = send({ root, from: 'mac', to: 'pc', subject: 'Respuesta', body: 'Vale', commit: 'def5678', now: NOW });
  assert.deepEqual([a.n, b.n, c.n], [1, 2, 1]);
  const text = fs.readFileSync(path.join(root, 'buzon', 'pc.md'), 'utf8');
  assert.match(text, /^## #1 · 2026-09-28 21:45 · commit abc1234 · Para: mac$/m);
  assert.match(text, /^## #2 · 2026-09-28 21:45 · Para: todas$/m);
  assert.match(text, /^\*\*Espero de ti:\*\* nada$/m);
  const msgs = parseMailbox(text);
  assert.deepEqual(msgs.map((m) => [m.n, m.subject, m.commit]), [[1, 'Primero', 'abc1234'], [2, 'Segundo', null]]);
});

test('unread: solo lo dirigido a mí o a todas, después de mi «Leído hasta»', () => {
  const root = three();
  send({ root, from: 'pc', to: 'mac', subject: 'Solo mac', body: 'x', commit: 'none' });
  send({ root, from: 'pc', to: 'pc2', subject: 'Solo pc2', body: 'x', commit: 'none' });
  send({ root, from: 'pc', to: 'all', subject: 'A todas', body: 'x', commit: 'none' });
  send({ root, from: 'pc2', to: 'mac,pc', subject: 'Dos destinos', body: 'x', commit: 'none' });
  const mac = unread({ root, me: 'mac' });
  assert.deepEqual(
    mac.map((u) => [u.from, u.messages.map((m) => m.subject)]),
    [['pc', ['Solo mac', 'A todas']], ['pc2', ['Dos destinos']]],
  );
  assert.deepEqual(unread({ root, me: 'pc2' })[0].messages.map((m) => m.subject), ['Solo pc2', 'A todas']);
});

test('ack solo escribe en MI buzón y deja de salir lo leído', () => {
  const root = three();
  send({ root, from: 'pc', to: 'mac', subject: 'Uno', body: 'x', commit: 'none' });
  send({ root, from: 'pc', to: 'mac', subject: 'Dos', body: 'x', commit: 'none' });
  const pcBefore = fs.readFileSync(path.join(root, 'buzon', 'pc.md'), 'utf8');
  ack({ root, me: 'mac', from: 'pc', upto: 1 });
  assert.deepEqual(unread({ root, me: 'mac' })[0].messages.map((m) => m.n), [2]);
  ack({ root, me: 'mac', all: true });
  assert.deepEqual(unread({ root, me: 'mac' }), []);
  assert.equal(fs.readFileSync(path.join(root, 'buzon', 'pc.md'), 'utf8'), pcBefore);
  const mac = fs.readFileSync(path.join(root, 'buzon', 'mac.md'), 'utf8');
  assert.deepEqual(parseAcks(mac), { pc: 2 });
  assert.match(mac, /^Leído de pc hasta: #2$/m);
});

test('ack no borra lo leído de otras sesiones y los envíos posteriores lo conservan', () => {
  const root = three();
  send({ root, from: 'pc', to: 'mac', subject: 'x', body: 'x', commit: 'none' });
  send({ root, from: 'pc2', to: 'mac', subject: 'y', body: 'y', commit: 'none' });
  ack({ root, me: 'mac', from: 'pc', upto: 1 });
  ack({ root, me: 'mac', from: 'pc2', upto: 1 });
  send({ root, from: 'mac', to: 'pc', subject: 'z', body: 'z', commit: 'none' });
  const mac = fs.readFileSync(path.join(root, 'buzon', 'mac.md'), 'utf8');
  assert.deepEqual(parseAcks(mac), { pc: 1, pc2: 1 });
  assert.equal(parseMailbox(mac).length, 1);
});

test('status resume todas las sesiones', () => {
  const root = three();
  send({ root, from: 'pc', to: 'all', subject: 'x', body: 'x', commit: 'none', now: NOW });
  const s = status({ root });
  assert.deepEqual(
    s.map((x) => [x.session, x.lastMessage, x.unread]),
    [['pc', 1, 0], ['mac', 0, 1], ['pc2', 0, 1]],
  );
});

test('en inglés: mailbox/, STATUS y «Read from … up to»', () => {
  const root = three('en');
  send({ root, from: 'mac', to: 'pc', subject: 'Done', body: 'ok', expect: 'a reply', commit: 'none' });
  ack({ root, me: 'pc', all: true });
  const pc = fs.readFileSync(path.join(root, 'mailbox', 'pc.md'), 'utf8');
  assert.match(pc, /^Read from mac up to: #1$/m);
  assert.ok(fs.existsSync(path.join(root, 'STATUS-pc.md')));
  assert.match(fs.readFileSync(path.join(root, 'mailbox', 'mac.md'), 'utf8'), /^\*\*I expect from you:\*\* a reply$/m);
});

test('errores claros', () => {
  const root = three();
  assert.throws(() => send({ root, from: 'pc', to: 'pc', subject: 's', body: 'b' }), /no se escribe|itself/);
  assert.throws(() => send({ root, from: 'pc', to: 'nadie', subject: 's', body: 'b' }), /not a session/);
  assert.throws(() => send({ root, from: 'pc', to: 'mac', subject: '', body: 'b' }), /subject/);
  assert.throws(() => unread({ root: tmp(), me: 'pc' }), /init/);
});

test('la línea de órdenes funciona de principio a fin', () => {
  const root = tmp();
  const run = (...a) => execFileSync(process.execPath, [SCRIPT, ...a], { encoding: 'utf8' });
  run('init', '--root', root, '--name', 'pc');
  run('register', '--root', root, '--by', 'pc', '--name', 'mac');
  run('init', '--root', root, '--name', 'mac', '--agent', 'mac-tests');
  assert.match(run('send', '--root', root, '--from', 'pc', '--to', 'mac', '--subject', 'Hola', '--body', 'Prueba', '--commit', 'none'), /ok · #1/);
  assert.match(run('unread', '--root', root, '--me', 'mac'), /#1 · .* · Hola/);
  run('ack', '--root', root, '--me', 'mac', '--all');
  assert.match(run('unread', '--root', root, '--me', 'mac'), /Nada sin leer/);
  assert.equal(JSON.parse(run('status', '--root', root, '--json'))[1].agent, 'mac-tests');
});

test('los plugins llevan copias idénticas del script y del hook, y la misma versión', () => {
  const repo = path.resolve(path.dirname(SCRIPT), '..');
  const read = (...p) => fs.readFileSync(path.join(repo, ...p));
  const market = JSON.parse(read('.claude-plugin', 'marketplace.json'));
  for (const entry of market.plugins) {
    const dir = entry.source.replace(/^\.\//, '');
    const skill = [dir, 'skills', 'wassup'];
    assert.ok(read(...skill, 'scripts', 'wassup.mjs').equals(read('scripts', 'wassup.mjs')), `${dir}: wassup.mjs`);
    assert.ok(read(...skill, 'hooks', 'notify-windows.ps1').equals(read('hooks', 'notify-windows.ps1')), `${dir}: hook`);
    const manifest = JSON.parse(read(dir, '.claude-plugin', 'plugin.json'));
    assert.equal(manifest.name, entry.name);
    assert.equal(manifest.version, entry.version);
  }
});

test('no quedan ficheros temporales tras escribir', () => {
  const root = three();
  send({ root, from: 'pc', to: 'mac', subject: 'x', body: 'x', commit: 'none' });
  ack({ root, me: 'mac', all: true });
  assert.deepEqual(fs.readdirSync(path.join(root, 'buzon')).filter((f) => f.endsWith('.tmp')), []);
});

// ---------- recordatorios ----------
const minutos = (d, m) => new Date(d.getTime() + m * 60000);

test('recordatorios: con «Espero de ti» hace falta contestar; sin él basta con leer', () => {
  const root = three();
  send({ root, from: 'pc', to: 'mac', subject: 'Batería', body: 'Pasa la batería', expect: 'el resultado', now: NOW });
  send({ root, from: 'pc', to: 'mac', subject: 'Aviso', body: 'Solo para que lo sepas', now: NOW });
  // Carga de mac: los 2 sin leer → umbral 60 × (1 + 2/5) = 84 min.
  assert.deepEqual(remind({ root, me: 'pc', now: minutos(NOW, 80) }), []);
  let r = remind({ root, me: 'pc', now: minutos(NOW, 85) });
  assert.deepEqual(r.map((x) => [x.n, x.needs, x.level, x.thresholdMin]), [[1, 'answer', 1, 84], [2, 'read', 1, 84]]);
  // Leer quita el recordatorio del aviso, pero no el de la petición.
  ack({ root, me: 'mac', all: true });
  r = remind({ root, me: 'pc', now: minutos(NOW, 85) });
  assert.deepEqual(r.map((x) => x.n), [1]);
  // Contestar con --re lo quita del todo.
  send({ root, from: 'mac', to: 'pc', subject: 'Hecho', body: '143 en verde', re: '1', now: minutos(NOW, 30) });
  assert.deepEqual(remind({ root, me: 'pc', now: minutos(NOW, 500) }), []);
});

test('recordatorios: una respuesta escrita a mano («re pc#4, #5») también cuenta', () => {
  assert.deepEqual(replyNumbers('re pc#4, #5 y #6 · lo que sea\notra línea #9').sort(), [4, 5, 6]);
  assert.deepEqual(replyNumbers('**En respuesta a:** #2'), [2]);
  assert.deepEqual(replyNumbers('texto con #7 suelto'), []);
});

test('recordatorios: más carga, más paciencia (con tope) y escalado a la persona', () => {
  const root = three();
  send({ root, from: 'pc', to: 'mac', subject: 'Petición', body: 'x', expect: 'algo', now: NOW });
  assert.deepEqual(remind({ root, me: 'pc', now: minutos(NOW, 71) }), []);
  const libre = remind({ root, me: 'pc', now: minutos(NOW, 73) })[0];
  assert.equal(libre.thresholdMin, 72); // carga 1 (esta misma): 60 × (1 + 1/5)
  // pc2 le carga 9 mensajes sin leer a mac: el umbral sube y el aviso aún no toca.
  for (let i = 0; i < 9; i++) send({ root, from: 'pc2', to: 'mac', subject: `c${i}`, body: 'x', now: NOW });
  // Carga 10 (9 de pc2 + esta): 60 × (1 + 10/5) = 180 min.
  assert.deepEqual(remind({ root, me: 'pc', now: minutos(NOW, 179) }), []);
  const r = remind({ root, me: 'pc', now: minutos(NOW, 180) })[0];
  assert.deepEqual([r.load, r.thresholdMin, r.level, r.action], [10, 180, 1, 'direct']);
  assert.equal(remind({ root, me: 'pc', now: minutos(NOW, 360) })[0].level, 2);
  const tarde = remind({ root, me: 'pc', now: minutos(NOW, 720) })[0];
  assert.equal(tarde.level, 3);
  assert.equal(tarde.action, 'user');
  // El tope: con carga enorme nunca pasa de maxMin.
  configure({ root, by: 'pc', base: 60, max: 90 });
  assert.equal(remind({ root, me: 'pc', now: minutos(NOW, 100) })[0].thresholdMin, 90);
});

test('recordatorios: modo automático nunca avisa a la persona; lo dado no se repite', () => {
  const root = three();
  configure({ root, by: 'pc', mode: 'auto' });
  assert.throws(() => configure({ root, by: 'mac', mode: 'auto' }), /coordinator/);
  send({ root, from: 'pc', to: 'mac', subject: 'P', body: 'x', expect: 'y', now: NOW });
  const r = remind({ root, me: 'pc', now: minutos(NOW, 1000) })[0];
  assert.equal(r.level, 3);
  assert.equal(r.action, 'direct');
  markReminded({ root, me: 'pc', key: 'mac#1', level: 3 });
  assert.deepEqual(remind({ root, me: 'pc', now: minutos(NOW, 2000) }), []);
  // Solo escribe su propio fichero.
  assert.ok(fs.existsSync(path.join(root, 'reminders-pc.json')));
  assert.ok(!fs.existsSync(path.join(root, 'reminders-mac.json')));
});

test('recordatorios: fechas del buzón escritas a mano (dd/mm/aaaa hh:mm)', () => {
  assert.deepEqual(parseStamp('29/09/2026 06:25'), new Date(2026, 8, 29, 6, 25));
  assert.deepEqual(parseStamp('2026-09-29 07:23'), new Date(2026, 8, 29, 7, 23));
  assert.equal(parseStamp('ayer'), null);
});

test('recordatorios: «Espero de ti: nada» no pide respuesta; --close-all migra un buzón viejo', () => {
  const root = three();
  send({ root, from: 'pc', to: 'mac', subject: 'Info', body: 'x', expect: 'nada; avisa si cambia', now: NOW });
  assert.equal(parseMailbox(fs.readFileSync(path.join(root, 'buzon', 'pc.md'), 'utf8'))[0].expect, '');
  assert.equal(remind({ root, me: 'pc', now: minutos(NOW, 200) })[0].needs, 'read');
  send({ root, from: 'pc', to: 'mac', subject: 'Viejo', body: 'x', expect: 'algo', now: NOW });
  assert.equal(closeAll({ root, me: 'pc' }), 2);
  assert.deepEqual(remind({ root, me: 'pc', now: minutos(NOW, 5000) }), []);
  // Lo que se envíe después sí se recuerda.
  send({ root, from: 'pc', to: 'mac', subject: 'Nuevo', body: 'x', expect: 'algo', now: minutos(NOW, 5000) });
  assert.deepEqual(remind({ root, me: 'pc', now: minutos(NOW, 5200) }).map((r) => r.n), [3]);
});
