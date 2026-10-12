#!/usr/bin/env node
// (b) PreToolUse · SendMessage: añade al principio del mensaje la hora del SISTEMA y un id corto,
// «[12-10-2026 07:50 CEST · id 1a2b3c4d] …», para que nadie dé horas de memoria y el receptor pueda acusar recibo.
// Si el mensaje ya lleva cabecera, no se duplica. Por defecto NO decide permisos: solo avisa (ver decidir()).
import { esPrincipal, horaSistema, idMensaje, leerEntrada, salir } from './comun.mjs';

export const RE_CABECERA = /^\[\d{2}-\d{2}-\d{4} \d{2}:\d{2}[^\]]*· id ([0-9a-f]{8})\]/;

export function conCabecera(mensaje, to, d = new Date()) {
  const m = String(mensaje ?? '');
  if (RE_CABECERA.test(m)) return m;
  const hora = horaSistema(d);
  return `[${hora} · id ${idMensaje(to ?? '', hora, m)}] ${m}`;
}

/**
 * Modo por defecto «avisar»: NO da decisión de permiso (no rodea la pregunta ni el clasificador). Si el mensaje
 * no lleva cabecera, solo avisa a Claude con la cabecera que debería poner.
 * Modo opcional «reescribir» (WASSUP_HORA=reescribir, desactivado por defecto): añade la cabecera con
 * `updatedInput` y `permissionDecision: "ask"`, de modo que la persona sigue viendo la pregunta de permiso.
 * Solo si la versión de Claude Code admite updatedInput con «ask».
 */
export function decidir(entrada, d = new Date(), modo = process.env.WASSUP_HORA) {
  if (entrada?.tool_name !== 'SendMessage') return null;
  const i = entrada.tool_input ?? {};
  if (typeof i.message !== 'string' || !i.message) return null; // suscripción pura: nada que fechar
  if (RE_CABECERA.test(i.message)) return null;
  const sugerida = conCabecera(i.message, i.to, d).slice(0, conCabecera(i.message, i.to, d).indexOf(']') + 1);
  if (modo === 'reescribir') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: 'Wassup: se añade la hora del sistema y el id al principio del mensaje.',
        updatedInput: { ...i, message: conCabecera(i.message, i.to, d) },
      },
    };
  }
  return {
    systemMessage: `Wassup: mensaje sin hora del sistema; cabecera sugerida ${sugerida}`,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `Wassup: el mensaje no lleva la hora del sistema. En el próximo, empieza por ${sugerida}`,
    },
  };
}

if (esPrincipal(import.meta.url)) salir(decidir(await leerEntrada()));
