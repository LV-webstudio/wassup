#!/usr/bin/env node
// (a) PreToolUse · SendMessage: bloquea el envío si el mensaje parece llevar una clave o un secreto.
// settings.json: {"hooks":{"PreToolUse":[{"matcher":"SendMessage","hooks":[{"type":"command","command":"node <ruta>/a-claves-sendmessage.mjs"}]}]}}
import { esPrincipal, leerEntrada, salir } from './comun.mjs';

export const PATRONES = [
  ['clave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['cuenta de servicio de Google', /"private_key"\s*:|"type"\s*:\s*"service_account"/],
  ['clave de Anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['clave tipo sk-', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['token de GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['clave de Google API', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['clave de AWS', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['token de Slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['token OAuth de Google', /\bya29\.[A-Za-z0-9_-]{20,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['contraseña escrita', /\b(?:password|passwd|contrase(?:ñ|n)a|clave|secret|token)\s*[:=]\s*["']?[^\s"']{8,}/i],
];

/** Devuelve los nombres de los patrones que aparecen (sin el valor: nunca se repite el secreto). */
export function hallarClaves(texto) {
  const t = String(texto ?? '');
  return PATRONES.filter(([, re]) => re.test(t)).map(([n]) => n);
}

export function decidir(entrada) {
  if (entrada?.tool_name !== 'SendMessage') return null;
  const i = entrada.tool_input ?? {};
  const halladas = hallarClaves(`${i.message ?? ''}\n${i.summary ?? ''}`);
  if (!halladas.length) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Wassup: el mensaje parece llevar ${halladas.join(', ')}. Quítalo y vuelve a enviarlo (las claves no viajan entre sesiones).`,
    },
  };
}

if (esPrincipal(import.meta.url)) salir(decidir(await leerEntrada()));
