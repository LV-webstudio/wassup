#!/usr/bin/env node
// (c) UserPromptSubmit: cuando llega un mensaje de otra sesión (<cross-session-message …>), apunta el acuse
// «RECIBIDO <id>» en un registro y le recuerda a Claude que conteste con ese acuse.
// El id es el de la cabecera de (b) si viene; si no, se calcula del remitente y el texto.
// Registro: $WASSUP_ACUSES (carpeta) → acuses-AAAA-MM-DD.log, una línea por mensaje. Sin carpeta, solo el recordatorio.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { esPrincipal, horaSistema, idMensaje, leerEntrada, salir } from './comun.mjs';
import { RE_CABECERA } from './b-hora-sendmessage.mjs';

const RE_MSG = /<cross-session-message\b([^>]*)>([\s\S]*?)<\/cross-session-message>/g;
const attr = (s, n) => (s.match(new RegExp(`${n}="([^"]*)"`)) ?? [])[1] ?? '';

/** Mensajes de otras sesiones que trae el prompt: [{de, id}]. */
export function mensajesEntrantes(prompt) {
  const out = [];
  for (const [, attrs, cuerpo] of String(prompt ?? '').matchAll(RE_MSG)) {
    const de = attr(attrs, 'from-name') || attr(attrs, 'from');
    const texto = cuerpo.trim();
    const id = (texto.match(RE_CABECERA) ?? [])[1] ?? idMensaje(de, texto);
    out.push({ de, id });
  }
  return out;
}

export function decidir(entrada, { carpeta = process.env.WASSUP_ACUSES, d = new Date() } = {}) {
  const msgs = mensajesEntrantes(entrada?.prompt);
  if (!msgs.length) return null;
  if (carpeta) {
    try {
      mkdirSync(carpeta, { recursive: true });
      const dia = d.toISOString().slice(0, 10);
      appendFileSync(join(carpeta, `acuses-${dia}.log`), msgs.map((m) => `${horaSistema(d)}\tRECIBIDO ${m.id}\tde ${m.de}\n`).join(''));
    } catch { /* el registro es un extra: nunca bloquea */ }
  }
  const lista = msgs.map((m) => `RECIBIDO ${m.id} (de ${m.de})`).join('; ');
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: `Wassup: acuse automático ${lista}. En la primera línea de tu respuesta a cada remitente pon «RECIBIDO <id>».`,
    },
  };
}

if (esPrincipal(import.meta.url)) salir(decidir(await leerEntrada()));
