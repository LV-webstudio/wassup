// Pruebas de M21 (capacidades) y M22 (recursos: `health`) · node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  capsOf,
  classify,
  configure,
  health,
  init,
  measure,
  parsePmsetTherm,
  parseSwapUsage,
  parseVmStat,
  register,
  remind,
  RESOURCES_DEFAULTS,
  send,
  status,
  VERSION,
} from './wassup.mjs';

const SCRIPT = fileURLToPath(new URL('./wassup.mjs', import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wassup-health-'));
const NOW = new Date(2026, 8, 29, 20, 0);
const later = (min) => new Date(NOW.getTime() + min * 60000);

function three() {
  const root = tmp();
  init({ root, name: 'pc', lang: 'es' });
  for (const n of ['mac', 'pc2']) {
    register({ root, by: 'pc', name: n });
    init({ root, name: n });
  }
  return root;
}
const sample = (over = {}) => ({
  so: 'test 1',
  nucleos: 4,
  ramTotalGB: 16,
  ramGB: 8,
  swapGB: 0,
  carga: 0.3,
  repoGB: 100,
  compartidaGB: 50,
  termica: { estado: 'normal', limiteVelocidadPct: 100, fuente: 'test' },
  vmMemGB: null,
  equipoId: 'aaaa1111',
  ...over,
});
const mailbox = (root, n) => fs.readFileSync(path.join(root, 'buzon', `${n}.md`), 'utf8');

const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                7000.
Pages active:                            200000.
Pages inactive:                          400000.
Pages speculative:                        10000.
Pages throttled:                              0.
Pages wired down:                        150000.
Pages purgeable:                          35000.
`;

test('T1 · macOS: se mide con vm_stat, no con os.freemem (no hay falsa alarma)', async () => {
  // (7000 + 400000 + 10000 + 35000) × 16 KiB ≈ 6,9 GB; freemem diría 1,3 GB.
  assert.equal(parseVmStat(VM_STAT), 6.9);
  const osm = {
    freemem: () => 1.3 * 1024 ** 3,
    totalmem: () => 16 * 1024 ** 3,
    cpus: () => Array(4).fill({ times: { idle: 1, user: 1 } }),
    loadavg: () => [2, 2, 2],
    release: () => '22.6',
    hostname: () => 'equipo-de-prueba',
  };
  const run = (cmd) => {
    if (cmd === 'vm_stat') return VM_STAT;
    if (cmd === 'sysctl') return 'vm.swapusage: total = 2048.00M  used = 1536.00M  free = 512.00M  (encrypted)';
    if (cmd === 'pmset') return 'Note: No thermal warning level has been recorded\nCPU_Speed_Limit = 100\n';
    throw new Error('no');
  };
  const s = await measure({ root: tmp(), platform: 'darwin', run, osm, env: { WASSUP_NO_DOCKER: '1' } });
  assert.equal(s.ramGB, 6.9);
  assert.equal(s.swapGB, 1.5);
  assert.equal(s.termica.estado, 'normal');
  assert.equal(s.carga, 0.5);
  assert.equal(classify(s, RESOURCES_DEFAULTS, null).estado, 'ok');
  assert.equal(parsePmsetTherm('CPU_Speed_Limit = 70').estado, 'estrangulada');
  assert.equal(parseSwapUsage('vm.swapusage: total = 4.00G  used = 1.25G  free = 2.75G'), 1.3);
});

test('T2 · RAM 0,2 GB dos muestras: saturado, un solo aviso a la coordinadora y código 2', async () => {
  const root = three();
  const a = await health({ root, me: 'mac', sample: sample({ ramGB: 0.2 }), now: NOW });
  assert.equal(a.estado, 'ok'); // una muestra no basta (histéresis)
  assert.equal(a.muestra, 'saturado');
  assert.equal(a.sent, null);
  const b = await health({ root, me: 'mac', sample: sample({ ramGB: 0.2 }), now: later(1) });
  assert.equal(b.estado, 'saturado');
  assert.equal(b.code, 2);
  assert.equal(b.sent, 1);
  const c = await health({ root, me: 'mac', sample: sample({ ramGB: 0.2 }), now: later(2) });
  assert.equal(c.sent, null); // un aviso por episodio
  const box = mailbox(root, 'mac');
  assert.equal(box.match(/\[recursos\] saturado/g).length, 1);
  assert.match(box, /Para: pc/);
  assert.match(box, /Espero de ti:\*\* reparto o espera/);
  assert.match(box, /RAM disponible 0,2 GB/);
});

test('T3 · un pico de 0,2 GB y luego 3 GB: sigue ok', async () => {
  const root = three();
  await health({ root, me: 'mac', sample: sample({ ramGB: 0.2 }), now: NOW });
  const r = await health({ root, me: 'mac', sample: sample({ ramGB: 3 }), now: later(1) });
  assert.equal(r.estado, 'ok');
  assert.equal(r.code, 0);
  assert.deepEqual(r.historial, ['saturado', 'ok']);
});

test('T4 · Windows sin permisos para la temperatura: «desconocida», sin error', async () => {
  const osm = {
    freemem: () => 3 * 1024 ** 3,
    totalmem: () => 8 * 1024 ** 3,
    cpus: () => Array(8).fill({ times: { idle: 10, user: 1, sys: 1 } }),
    loadavg: () => [0, 0, 0],
    release: () => '10.0',
    hostname: () => 'otro',
  };
  const s = await measure({
    root: tmp(),
    platform: 'win32',
    run: () => {
      throw new Error('Access denied');
    },
    osm,
    env: {},
  });
  assert.equal(s.termica.estado, 'desconocida');
  assert.equal(s.ramGB, 3);
  assert.equal(s.swapGB, null);
});

test('T5 · carpeta compartida por debajo del mínimo: saturado por disco', async () => {
  const root = three();
  await health({ root, me: 'mac', sample: sample({ compartidaGB: 1.5 }), now: NOW });
  const r = await health({ root, me: 'mac', sample: sample({ compartidaGB: 1.5 }), now: later(1) });
  assert.equal(r.estado, 'saturado');
  assert.deepEqual(r.motivos, ['compartida 1,5 GB']);
  assert.equal(classify(sample({ repoGB: 8 }), RESOURCES_DEFAULTS, null).estado, 'justo');
  assert.equal(classify(sample({ termica: { estado: 'aviso' } }), RESOURCES_DEFAULTS, null).estado, 'saturado');
  assert.equal(classify(sample({ carga: 1.2 }), RESOURCES_DEFAULTS, null).estado, 'justo');
  assert.equal(classify(sample({ carga: 2 }), RESOURCES_DEFAULTS, null).estado, 'saturado');
});

test('T6 · dos sesiones en el mismo equipo saturado: un aviso, no dos', async () => {
  const root = three();
  const s = sample({ ramGB: 0.3, equipoId: 'mismo01' });
  for (const [i, me] of [['0', 'mac'], ['0', 'pc2'], ['1', 'mac'], ['1', 'pc2']].map(([k, m]) => [Number(k), m]))
    await health({ root, me, sample: s, now: later(i) });
  const avisos = ['mac', 'pc2'].map((x) => (mailbox(root, x).match(/\[recursos\] saturado/g) ?? []).length);
  assert.deepEqual(avisos, [1, 0]);
});

test('recuperación: al volver a ok (dos muestras) avisa «[recursos] ok» quien avisó', async () => {
  const root = three();
  for (const [m, ram] of [[0, 0.2], [1, 0.2], [2, 4], [3, 4]]) await health({ root, me: 'mac', sample: sample({ ramGB: ram }), now: later(m) });
  const box = mailbox(root, 'mac');
  assert.equal(box.match(/\[recursos\] ok/g).length, 1);
});

test('T7 · la coordinadora ve «libre y con recursos» pasado el tiempo, una vez', async () => {
  const root = three();
  send({ root, from: 'mac', to: 'pc', subject: 'Batería', body: 'Todo verde. libre', now: NOW });
  await health({ root, me: 'mac', sample: sample(), now: NOW });
  assert.equal(remind({ root, me: 'pc', now: later(10) }).filter((r) => r.kind === 'libre').length, 0);
  const r = remind({ root, me: 'pc', now: later(16) }).filter((x) => x.kind === 'libre');
  assert.equal(r.length, 1);
  assert.equal(r[0].to, 'mac');
  assert.ok(r[0].freeMin >= 16);
  execFileSync(process.execPath, [SCRIPT, 'remind', '--root', root, '--me', 'pc', '--mark', r[0].key]);
  assert.equal(remind({ root, me: 'pc', now: later(20) }).filter((x) => x.kind === 'libre').length, 0);
  // Un encargo nuevo sin contestar le quita el «libre».
  send({ root, from: 'pc', to: 'mac', subject: 'Otro', body: 'x', expect: 'hazlo', now: later(21) });
  const h = await health({ root, me: 'mac', sample: sample(), now: later(22) });
  assert.equal(h.trabajo.libre, false);
});

test('T8 · desequilibrio: pc2 saturado con una batería y mac libre con Playwright → moverla', async () => {
  const root = three();
  init({ root, name: 'mac', caps: 'Playwright, Safari' });
  send({ root, from: 'mac', to: 'pc', subject: 'Hecho', body: 'libre', now: NOW });
  await health({ root, me: 'mac', sample: sample({ equipoId: 'mac00001' }), now: NOW });
  await health({ root, me: 'pc2', sample: sample({ ramGB: 0.2, equipoId: 'pc000001' }), busy: 'batería e2e 150 pruebas', needs: 'playwright', now: NOW });
  await health({ root, me: 'pc2', sample: sample({ ramGB: 0.2, equipoId: 'pc000001' }), now: later(1) });
  const d = remind({ root, me: 'pc', now: later(2) }).filter((x) => x.kind === 'desequilibrio');
  assert.equal(d.length, 1);
  assert.deepEqual([d[0].from, d[0].to, d[0].job], ['pc2', 'mac', 'batería e2e 150 pruebas']);
  // Si mac no tuviera lo que pide el trabajo, no se sugiere.
  init({ root, name: 'mac', caps: 'safari' });
  assert.equal(remind({ root, me: 'pc', now: later(2) }).filter((x) => x.kind === 'desequilibrio').length, 0);
});

test('T9 · un despliegue nunca se sugiere mover (credenciales)', async () => {
  const root = three();
  init({ root, name: 'mac', caps: 'playwright' });
  send({ root, from: 'mac', to: 'pc', subject: 'Hecho', body: 'libre', now: NOW });
  await health({ root, me: 'mac', sample: sample({ equipoId: 'mac00001' }), now: NOW });
  for (const m of [0, 1])
    await health({ root, me: 'pc2', sample: sample({ ramGB: 0.2, equipoId: 'pc000001' }), busy: m ? undefined : 'despliegue de reglas a producción', now: later(m) });
  assert.equal(remind({ root, me: 'pc', now: later(2) }).filter((x) => x.kind === 'desequilibrio').length, 0);
});

test('T10 · salud-<yo>.json: versión y solo cifras (sin procesos, rutas ni usuarios)', async () => {
  const root = three();
  const s = await measure({ root, env: { WASSUP_NO_DOCKER: '1' } });
  await health({ root, me: 'mac', sample: s, now: NOW });
  const text = fs.readFileSync(path.join(root, 'salud-mac.json'), 'utf8');
  const j = JSON.parse(text);
  assert.equal(j.v, 1);
  assert.deepEqual(Object.keys(j), ['v', 'sesion', 'ts', 'equipo', 'ram', 'cpu', 'disco', 'termica', 'contenedores', 'estado', 'muestra', 'motivos', 'trabajo', 'historial', 'aviso']);
  for (const secret of [os.hostname(), os.userInfo().username, os.homedir(), root, process.cwd()])
    assert.ok(!text.includes(secret), `no debe aparecer: ${secret}`);
  assert.match(j.equipo.id, /^[0-9a-f]{8}$/);
});

test('M21 · capacidades en el buzón propio (una línea) y en status; saturada = doble de paciencia', async () => {
  const root = three();
  init({ root, name: 'mac', agent: 'mac-tests', caps: 'Playwright, cred:ferro-deploy' });
  init({ root, name: 'mac', caps: 'playwright, safari' });
  const box = mailbox(root, 'mac');
  assert.equal(box.match(/^Capacidades: .*$/gm).length, 1);
  assert.deepEqual(capsOf(box), ['playwright', 'safari']);
  assert.match(box, /^Sesión de Claude Code: mac-tests\nCapacidades: playwright, safari$/m);
  await health({ root, me: 'mac', sample: sample(), now: NOW });
  const st = status({ root }).find((x) => x.session === 'mac');
  assert.deepEqual(st.caps, ['playwright', 'safari']);
  assert.equal(st.health.estado, 'ok');
  // Mensaje de pc a mac con «Espero de ti»: con carga 1 el umbral es 72 min; si mac está saturada, 144.
  send({ root, from: 'pc', to: 'mac', subject: 'Encargo', body: 'x', expect: 'hazlo', now: NOW });
  assert.equal(remind({ root, me: 'pc', now: later(80) }).filter((r) => !r.kind).length, 1);
  for (const m of [0, 1]) await health({ root, me: 'mac', sample: sample({ ramGB: 0.2 }), now: later(m) });
  assert.equal(remind({ root, me: 'pc', now: later(80) }).filter((r) => !r.kind).length, 0);
});

test('config de recursos: solo la coordinadora; valores numéricos', () => {
  const root = three();
  assert.throws(() => configure({ root, by: 'mac', recursos: { ramDisponibleMinGB: 2 } }), /coordinator/);
  const r = configure({ root, by: 'pc', recursos: { ramDisponibleMinGB: 0.5, libreRecordarMin: 30 } });
  assert.equal(r.recursos.ramDisponibleMinGB, 0.5);
  assert.equal(r.recursos.libreRecordarMin, 30);
  assert.throws(() => configure({ root, by: 'pc', recursos: { ramDisponibleMinGB: 'mucho' } }), /number/);
});

test('línea de órdenes: --version y código de salida con WASSUP_FAKE_RAM_GB', () => {
  const root = three();
  assert.equal(execFileSync(process.execPath, [SCRIPT, '--version']).toString().trim(), VERSION);
  const env = { ...process.env, WASSUP_FAKE_RAM_GB: '0.2', WASSUP_NO_DOCKER: '1' };
  const run = () => {
    try {
      execFileSync(process.execPath, [SCRIPT, 'health', '--root', root, '--me', 'mac', '--quiet'], { env, stdio: 'pipe' });
      return 0;
    } catch (e) {
      return e.status;
    }
  };
  assert.equal(run(), 0);
  assert.equal(run(), 2);
  assert.equal(mailbox(root, 'mac').match(/\[recursos\] saturado/g).length, 1);
});

test('--version coincide con la versión de los plugins', () => {
  const repo = path.resolve(path.dirname(SCRIPT), '..');
  const market = JSON.parse(fs.readFileSync(path.join(repo, '.claude-plugin', 'marketplace.json'), 'utf8'));
  for (const entry of market.plugins) assert.equal(entry.version, VERSION, entry.name);
});

test('sysctl en español: «used = 1568,25M» (coma decimal)', () => {
  assert.equal(parseSwapUsage('vm.swapusage: total = 2048,00M  used = 1568,25M  free = 479,75M  (encrypted)'), 1.5);
  assert.equal(parseSwapUsage('vm.swapusage: total = 4,00G  used = 1,25G  free = 2,75G'), 1.3);
  assert.equal(parseSwapUsage('nada'), null);
});

test('línea de health: si la muestra difiere del estado (histéresis), lo dice; config y status enseñan las incidencias; falta --by', () => {
  const root = three();
  const env = { ...process.env, WASSUP_FAKE_RAM_GB: '0.2', WASSUP_NO_DOCKER: '1' };
  const w = (args, e = process.env) => {
    try {
      return execFileSync(process.execPath, [SCRIPT, ...args], { env: e, stdio: 'pipe' }).toString();
    } catch (err) {
      return String(err.stdout) + String(err.stderr);
    }
  };
  assert.match(w(['health', '--root', root, '--me', 'mac'], env), /^ok \(esta muestra: saturado; el estado cambia con 2 muestras seguidas\) · RAM disponible 0,2 GB/);
  assert.match(w(['health', '--root', root, '--me', 'mac'], env), /^saturado · RAM disponible 0,2 GB/);
  assert.match(w(['config', '--root', root, '--by', 'pc', '--incidents', 'on']), /incidents: on/);
  assert.match(w(['status', '--root', root]), /incidencias: encendidas\s*$/);
  assert.match(w(['config', '--root', root, '--incidents', 'off']), /--by <coordinator> is missing \(the coordinator is «pc»\)/);
  assert.match(w(['register', '--root', root, '--name', 'otra']), /--by <coordinator> is missing/);
});
