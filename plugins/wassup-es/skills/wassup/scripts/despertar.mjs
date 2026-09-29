#!/usr/bin/env node
// Wassup · modo despertar
// Abre en una consola nueva una sesión de Claude Code que está cerrada, retomando su conversación.
//
//   node despertar.mjs --nombre shop-mac          busca la sesión por su nombre (/rename, o el de ListAgents si se guardó)
//   node despertar.mjs --id 0f3c9a2e-…              por identificador de conversación
//   node despertar.mjs --nombre shop-mac --prueba solo dice qué abriría, sin abrir nada
//   (también valen los nombres en inglés: --name, --dry-run)
//
// Por qué hace falta: si una sesión lanza `claude` directamente, la nueva hereda sus variables
// CLAUDE_* (entre ellas CLAUDE_CODE_CHILD_SESSION), se toma por sesión hija, NO guarda su
// conversación y no es alcanzable por las demás. Aquí se lanza con esas variables borradas,
// en la carpeta donde se abrió la conversación (sin eso, --resume no la encuentra).
//
// Solo abre una sesión que SE LLAME así. Si el nombre solo aparece dentro de otras conversaciones,
// las enseña y pide --id: abrir la sesión equivocada es peor que no abrir ninguna.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const val = (...ks) => { for (const k of ks) { const i = args.indexOf(k); if (i >= 0) return args[i + 1]; } return undefined; };
const nombre = val("--nombre", "--name"), idPedido = val("--id"), prueba = args.includes("--prueba") || args.includes("--dry-run");
if (!nombre && !idPedido) { console.error("Uso: despertar.mjs --nombre <sesión> | --id <uuid> [--prueba]"); process.exit(1); }

const base = path.join(os.homedir(), ".claude", "projects");
const yo = process.env.CLAUDE_CODE_SESSION_ID || "";
const cuando = (t) => new Date(t).toLocaleString("es-ES");
const marcas = nombre ? [`"customTitle":"${nombre}"`, `"agentName":"${nombre}"`, `"aiTitle":"${nombre}"`] : [];
const candidatos = [];
for (const dir of fs.existsSync(base) ? fs.readdirSync(base) : []) {
  const d = path.join(base, dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith(".jsonl")) continue;
    const id = f.slice(0, -6);
    if (id === yo) continue; // nunca a sí misma
    if (idPedido && id !== idPedido) continue;
    const ruta = path.join(d, f);
    const texto = fs.readFileSync(ruta, "utf8");
    // Coincidencia fuerte: la sesión SE LLAMA así; débil: solo menciona el nombre.
    const fuerte = !nombre || marcas.some((t) => texto.includes(t));
    if (!fuerte && !texto.includes(`"${nombre}"`)) continue;
    const cwd = (texto.match(/"cwd":"((?:[^"\\]|\\.)*)"/) || [])[1];
    if (!cwd) continue;
    candidatos.push({ id, cwd: JSON.parse(`"${cwd}"`), fecha: fs.statSync(ruta).mtimeMs, fuerte });
  }
}
const fuertes = candidatos.filter((c) => c.fuerte).sort((a, b) => b.fecha - a.fecha);
if (!fuertes.length) {
  if (!candidatos.length) {
    console.error(`No encuentro esa sesión en ${base}.`);
    if (nombre) console.error(`Si no tiene /rename, su nombre de ListAgents no se guarda en la conversación: dale uno con «/rename ${nombre}» la próxima vez, o usa --id.`);
    process.exit(2);
  }
  console.error(`Ninguna sesión se llama «${nombre}». Estas conversaciones solo lo mencionan; abre la buena con --id:`);
  for (const c of candidatos.sort((a, b) => b.fecha - a.fecha).slice(0, 10)) console.error(`  --id ${c.id}   ${cuando(c.fecha)}   ${c.cwd}`);
  process.exit(3);
}
const s = fuertes[0];
const titulo = nombre || s.id.slice(0, 8);
console.log(`Sesión ${titulo}: ${s.id}\nCarpeta: ${s.cwd}\nÚltima actividad: ${cuando(s.fecha)}`);
if (fuertes.length > 1) console.log(`(Hay ${fuertes.length} conversaciones con ese nombre: se abre la más reciente. Otras: ${fuertes.slice(1, 4).map((c) => c.id).join(", ")})`);
if (prueba) process.exit(0);

// Entorno limpio: fuera todo lo que marca a la nueva como hija de esta.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDE/i.test(k)));
const orden = `claude --resume ${s.id}`; // el id es un UUID: seguro en cualquier shell

if (process.platform === "win32") {
  spawn("cmd.exe", ["/c", "start", `"${titulo.replace(/"/g, "")}"`, "/D", `"${s.cwd}"`, "cmd", "/k", orden],
    { env, detached: true, stdio: "ignore", windowsVerbatimArguments: true }).unref();
} else if (process.platform === "darwin") {
  // Terminal.app arranca un shell de inicio nuevo (no hereda las CLAUDE_* de este proceso).
  // La carpeta pasa por `quoted form of` de AppleScript: espacios, comillas, $ o \ no rompen nada.
  const cadena = (x) => `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const script = `tell application "Terminal" to do script "cd " & quoted form of ${cadena(s.cwd)} & " && ${orden}"`;
  spawn("osascript", ["-e", script, "-e", 'tell application "Terminal" to activate'], { env, detached: true, stdio: "ignore" }).unref();
} else {
  // La terminal arranca en la carpeta de la sesión (cwd): ninguna ruta pasa por el shell.
  spawn("x-terminal-emulator", ["-e", "bash", "-lc", orden], { env, cwd: s.cwd, detached: true, stdio: "ignore" }).unref();
}
console.log("Abierta en una consola nueva. Dentro: /remote-control si hace falta y «wassup» para que lea el buzón.");
