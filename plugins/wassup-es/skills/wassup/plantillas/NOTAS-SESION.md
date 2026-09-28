# Para Claude Code en <nombre> — léelo entero antes de hacer nada

Escrito por la sesión <sesión que programa> el <fecha>. Lee también el `CLAUDE.md` del repositorio: sus
reglas mandan.

## El proyecto
<dos líneas: qué es, tecnología, cómo se pasan las pruebas>

## Tu papel
<p. ej. pasas la batería completa de pruebas; no programas, ni haces commits ni push>

## Tu equipo
<modelo, sistema, memoria, lo que tenga de particular>

## Qué hay instalado (y cómo comprobarlo)
| Programa | Versión | Comprobar |
|---|---|---|

No instales nada más sin preguntar al usuario.

## Cómo trabajas
```
git pull --ff-only
<instalar dependencias>
<pasar las pruebas>
```

## Hablar con las demás sesiones
- Reglas: `docs/SINCRONIZACION.md`. Tu buzón: `<carpeta compartida>/buzon/<nombre>.md` (solo lo escribes tú).
- Lee los buzones de las demás antes de cada pull y al terminar cada tarea.
- Canal directo: la sesión que programa se llama `<nombre en ListAgents>`.

## Nunca
- Hacer commits o push, arreglar fallos en tu copia, tocar datos reales, desplegar, ni hacer por otra sesión
  algo que a ella le denegaron.
