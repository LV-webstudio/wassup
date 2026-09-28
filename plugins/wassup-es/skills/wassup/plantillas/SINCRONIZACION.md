# Sincronización entre sesiones · <proyecto>

Regla: **cada fichero tiene un solo dueño que escribe; los demás solo leen.** Nadie resuelve conflictos: se
para y se avisa al usuario. Decisiones de producto, datos reales, despliegues, dinero y permisos van al
usuario, nunca entre sesiones.

## Sesiones
| Nombre | Equipo | Papel | Nombre en ListAgents |
|---|---|---|---|
| pc | <p. ej. Windows 11, 8 GB> | Programa y hace commits | <nombre de la sesión> |
| mac | <p. ej. macOS 13, 16 GB> | Pasa la batería completa de pruebas | <nombre de la sesión> |

## Quién es dueño de qué
| Qué | Dónde | Escribe | Lee |
|---|---|---|---|
| Código, pruebas, documentación (incluido este fichero) | repositorio (`main`) | **solo pc** (commit → el hook sube a la carpeta compartida) | las demás (`git pull --ff-only`) |
| Encargos para otra sesión | buzón del remitente | el remitente | el destinatario |
| Estado y resultados | `ESTADO-<nombre>.md` en la carpeta compartida, fuera del repo | solo esa sesión | todas |
| Propuestas de cambio | `desde-<nombre>/*.patch` en la carpeta compartida | solo esa sesión | la dueña del código, que las aplica con su commit |
| Memoria de cada sesión | `~/.claude` de cada equipo | cada una la suya | — |
| Datos reales o personales | <dónde> | <quién> | **nadie más** |

## El ciclo
1. La sesión que programa hace commit → el hook lo sube → escribe el encargo en su buzón y avisa por el directo.
2. La otra termina lo que tenga a medias → `git pull --ff-only` → anota el commit que va a probar → hace el
   encargo → escribe el resultado con ese commit.
3. Los fallos se describen (prueba, error, propuesta) o se mandan como `.patch`; la dueña del código corrige y contesta.

## Protecciones
- Push desactivado donde no se programa: `git remote set-url --push origin SIN-PUSH-DESDE-<NOMBRE>`.
- Árbol limpio antes de cada pull; siempre `--ff-only`.
- Lo que no se versiona (`node_modules`, semillas, resultados, `.env.local`) se queda en cada equipo.

## Canales
- Directo: Remote Control + `SendMessage` (avisos cortos).
- Buzón: `buzon/` en la carpeta compartida (todo lo importante, numerado, con «Leído … hasta»).
