# Modslimit

**Un mod de Claude Code que elige el modelo según la tarea.** Manda las tareas simples a Haiku, deja las estándar en el modelo de la sesión y reserva Opus para las críticas, para reducir el consumo sin renunciar a calidad donde importa.

[![CI](https://github.com/jmstudio14/Modslimit/actions/workflows/ci.yml/badge.svg)](https://github.com/jmstudio14/Modslimit/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
![Claude Code](https://img.shields.io/badge/Claude%20Code-mod-D97757.svg)

---

## Índice

- [Qué hace](#qué-hace)
- [Instalación](#instalación)
- [Uso](#uso)
- [Cómo funciona](#cómo-funciona)
- [Configuración](#configuración)
- [Verificado en una sesión real](#verificado-en-una-sesión-real)
- [Riesgos y limitaciones](#riesgos-y-limitaciones)
- [Solución de problemas](#solución-de-problemas)
- [Desarrollo](#desarrollo)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

---

## Qué hace

Clasifica cada prompt por palabras clave, en local y sin llamadas a la API, y fija el modelo de ese turno:

| Nivel | Modelo | Casos de uso |
|-------|--------|--------------|
| **Simple** | Claude Haiku | Formatear texto, limpiar datos, renombrar, convertir formatos, traducir |
| **Estándar** *(por defecto)* | El de la sesión | Funciones, errores, tests, lógica de negocio: el mod no toca nada |
| **Crítico** | Claude Opus | Diseño de arquitectura, refactorización a gran escala, algoritmos avanzados, concurrencia |

> **El ahorro depende de que tu sesión use Sonnet** (`/model sonnet`). "Estándar" significa "no cambiar el modelo": si la sesión va en Opus, las tareas estándar se quedan en Opus.

---

## Instalación

Requiere Claude Code 2.1.275 o posterior, con soporte de mods (verificado con la 2.1.312).

```
/plugin install modslimit-router --marketplace jmstudio14/Modslimit
```

Desde un terminal, sin abrir Claude Code: `claude plugin install modslimit-router --marketplace jmstudio14/Modslimit`. En la app de escritorio, donde `/plugin` no funciona: **+** junto al cuadro de texto, **Plugins**, **Add marketplace** con `jmstudio14/Modslimit`, y después **Add plugin**.

Verás, por orden: `Add marketplace?` (responde `y`), los detalles del plugin con el ámbito de usuario primero (Enter), una pantalla para fijar `maxTurnsToDownshift` y, al final, `Installed modslimit-router. Plugin is now active.` Se activa en la sesión actual sin reiniciar.

Para probarlo sin instalarlo, o mientras lo modificas: `claude --plugin-dir mods/modslimit-router`.

---

## Uso

El enrutamiento es automático. Para forzar un nivel, inicia el prompt con un prefijo:

| Prefijo | Efecto |
|---------|--------|
| `!haiku` | Fuerza Haiku, aunque la conversación sea larga |
| `!sonnet` | Fuerza Sonnet |
| `!opus` | Fuerza Opus |

- **Barra de estado.** Cuando el mod cambia el modelo muestra `router: haiku · turno 3`; cuando una tarea simple se queda como está por ser la conversación larga, `router: sin cambio, conversación larga · turno 9`. En las tareas estándar no muestra nada.
- **`/router-stats`** resume los tokens por nivel de los últimos 200 turnos. No incluye precios a propósito, porque se quedarían obsoletos: compáralo con `/cost`.

Los comandos de barra (`/help`, `/model`…) y los turnos sin prompt escrito no se enrutan, ni los subagentes.

---

## Cómo funciona

| Evento | Qué hace |
|--------|----------|
| `turn.start` | Clasifica el prompt y decide el modelo del turno entero, una sola vez. Lo guarda en el estado de la sesión |
| `turn.step` | Reescribe el modelo de cada petición del turno con esa decisión |
| `turn.complete` | Anota los tokens reales del turno |
| `/router-stats` | Muestra turnos y tokens por nivel |

Se decide una vez por turno para no cambiar de modelo a mitad de tarea. Si algo falla, el turno sigue con el modelo de la sesión. Según el validador del propio Claude Code, el mod solo usa `$.state`, `$.store`, `$.clock`, `$.command`, `$.session` y `$.ui`: no accede a red, procesos ni archivos.

**Salvaguarda de conversación larga.** No baja a Haiku si la persona ya ha enviado más de `maxTurnsToDownshift` prompts (6 por defecto), salvo con `!haiku`. Cambiar de modelo obliga a volver a pagar todo el contexto, y en una conversación larga eso puede costar más de lo que se ahorra. Se mide con los prompts enviados y no con los mensajes de la petición, porque estos incluyen el contexto que inyecta el motor (instrucciones del proyecto, avisos) y una sesión recién abierta ya puede llevar decenas.

---

## Configuración

Las reglas están en `mods/modslimit-router/hooks/rules.ts`, con comentarios:

| Clave | Descripción |
|-------|-------------|
| `default_tier` | Nivel cuando nada coincide. `sonnet` = dejar el modelo de la sesión |
| `overrides` | Prefijos de selección manual y su nivel |
| `tiers.<nivel>.keywords` | Palabras clave del nivel: subcadena, sin distinguir mayúsculas ni tildes |
| `tiers.<nivel>.min_hits` | Coincidencias mínimas para asignar el nivel |
| `max_prompt_chars_for_haiku` | Un prompt más largo que esto nunca va a Haiku |

**Orden de evaluación:** prefijo manual, Opus, Haiku y nivel por defecto. Ante coincidencias en ambos niveles, gana Opus.

Desde el menú de configuración del plugin se ajusta `maxTurnsToDownshift` (prompts máximos para bajar a Haiku, 6 por defecto).

---

## Verificado en una sesión real

Se ejecutó `claude -p` con el mod cargado desde la raíz de este repositorio y se leyó a qué modelo fue la petición principal. Un control sin el mod, ejecutado desde una carpeta vacía, da la referencia:

| Prompt | Mod | Modelo de la petición principal | Coste según la CLI |
|--------|-----|--------------------------------|--------------------|
| `Renombra la variable x a total…` | no | Sonnet | 0,071 $ |
| `Renombra la variable x a total…` | sí | **Haiku** · `router: haiku · turno 1` | 0,004 $ |
| `Explica en una frase qué es una variable` | sí | Sonnet, sin cambio y sin aviso | 0,067 $ |
| `!opus responde solo OK` | sí | **Opus** · `router: opus · turno 1` | 0,130 $ |

En una misma sesión, un primer prompt estándar se quedó en Sonnet y el segundo, simple, mostró `router: haiku · turno 2` y fue a Haiku: el contador sube y el cambio de modelo funciona a mitad de conversación.

Haiku aparece también sin el mod, pero con unos 1 200 tokens: es el que Claude Code usa para sus tareas internas. Lo que prueba el enrutamiento es dónde fue la petición grande.

**Lo que esta verificación no cubre.** Es una ejecución por caso y el coste lo calcula la propia CLI, no es facturación. Las conversaciones son de uno o dos turnos: no se ha probado en vivo una conversación de más de 6 prompts (la salvaguarda está cubierta por tests con el motor simulado) y no se ha medido el efecto de la caché de prompt en conversaciones largas.

---

## Riesgos y limitaciones

- **API temprana.** Los mods son recientes y su documentación avisa de que la API puede cambiar sin previo aviso. Verificado solo con Claude Code 2.1.312.
- **Cambiar de modelo tiene un coste.** La caché de prompt no se comparte entre modelos. El umbral de 6 prompts es una estimación mía, sin medir: si es demasiado alto, el cambio puede salir más caro que no hacerlo.
- **El ahorro no está medido.** `/router-stats` da tokens, no dinero.
- **Precisión heurística.** La clasificación por palabras clave no interpreta la intención: *«renombra el módulo y rediseña sus interfaces»* se tomaría como simple. Los prefijos `!haiku`, `!sonnet` y `!opus` están para corregirlo.

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| Nunca aparece `router: …` | El mod no está activo, o las tareas son estándar | Comprueba que `/router-stats` existe; prueba con `!opus responde OK` |
| Las tareas simples siguen en Sonnet | Llevas más de `maxTurnsToDownshift` prompts en la sesión | Súbelo en la configuración del plugin o fuerza con `!haiku` |
| Una tarea se clasifica mal | Palabras clave demasiado amplias o escasas | Ajusta `rules.ts` y añade el caso a `tests/fixtures/prompts.json` |
| Las tareas estándar usan Opus | Tu sesión va en Opus; "estándar" no cambia el modelo | `/model sonnet` |

---

## Desarrollo

```bash
node --test tests/test_classify_ts.mjs          # clasificador contra tests/fixtures/prompts.json
claude plugin validate .                         # marketplace, manifiesto y llamadas a $
claude plugin test mods/modslimit-router         # hooks del mod contra el motor
```

Los tests de `mods/modslimit-router/test/` cubren el nivel elegido, la decisión por turno, la salvaguarda de conversación larga (incluido el caso de que el contexto inyectado no la dispare), subagentes, comandos, estado inesperado y `/router-stats`.

GitHub Actions (`.github/workflows/ci.yml`) valida los JSON y ejecuta el clasificador contra los fixtures con Node 22 en cada *pull request* y en cada *push* a `main`. `claude plugin validate` y `claude plugin test` necesitan el binario de Claude Code, así que se ejecutan en local.

---

## Contribuir

Las propuestas de mejora son bienvenidas mediante *issues* o *pull requests*. Para cambios en las reglas, añade a `tests/fixtures/prompts.json` los prompts mal clasificados con su nivel esperado y comprueba que pasan los tres comandos de arriba.

---

## Licencia

Distribuido bajo la licencia [MIT](LICENSE). © 2026 jmstudio14.
