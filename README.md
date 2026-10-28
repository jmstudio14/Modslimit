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

### Comprobar que funciona

```bash
node tests/live/smoke.mjs        # usa el mod instalado
```

Lanza `claude -p` desde una carpeta vacía con tres prompts y comprueba el modelo de la petición principal y lo que anuncia el mod: simple a Haiku, estándar sin cambio y `!opus` a Opus. Gasta unos 0,2 $ de cuota según la CLI. Con el mod cargado desde una carpeta, añade `--plugin-dir mods/modslimit-router` y no lo tengas instalado a la vez.

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

**Salvaguarda de conversación larga.** No baja a Haiku si la persona ya ha enviado más de `maxTurnsToDownshift` prompts (6 por defecto), salvo con `!haiku`. Cambiar de modelo obliga a volver a pagar el contexto en el modelo nuevo; lo medido (ver [Qué cuesta cambiar de modelo](#qué-cuesta-cambiar-de-modelo-medido)) indica que el primer cambio cuesta algo más y los turnos siguientes mucho menos, así que este umbral es una cautela y no un coste demostrado. Se mide con los prompts enviados y no con los mensajes de la petición, porque estos incluyen el contexto que inyecta el motor (instrucciones del proyecto, avisos) y una sesión recién abierta ya puede llevar decenas.

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

El mod se instaló por la vía documentada (`claude plugin install modslimit-router --marketplace jmstudio14/Modslimit`, ámbito de usuario) y se ejecutó `claude -p` desde una carpeta vacía, sin `--plugin-dir`, leyendo a qué modelo fue la petición principal. Un control sin el mod da la referencia:

| Prompt | Mod | Modelo de la petición principal | Coste según la CLI |
|--------|-----|--------------------------------|--------------------|
| `Renombra la variable x a total…` | no | Sonnet | 0,071 $ |
| `Renombra la variable x a total…` | sí | **Haiku** · `router: haiku · turno 1` | 0,004 $ |
| `Explica en una frase qué es una variable` | sí | Sonnet, sin cambio y sin aviso | 0,065 $ |
| `!opus responde solo OK` | sí | **Opus** · `router: opus · turno 1` | 0,130 $ |

- **Salvaguarda de conversación larga, en vivo.** En una sesión de 8 prompts, los 7 primeros (estándar) se quedaron en Sonnet y el 8.º, simple, mostró `router: sin cambio, conversación larga · turno 8` y no bajó de modelo.
- **Cambio a mitad de conversación.** Con un primer prompt estándar y un segundo simple en la misma sesión, el segundo mostró `router: haiku · turno 2` y fue a Haiku.
- **Coste fijo.** Según `claude plugin details`, instalarlo añade 0 tokens a cada sesión.

Haiku aparece también sin el mod, pero con unos 1 200 tokens: es el que Claude Code usa para sus tareas internas. Lo que prueba el enrutamiento es dónde fue la petición grande.

### Qué cuesta cambiar de modelo (medido)

En una conversación de unos 95 000 tokens de contexto, con una ejecución por celda y costes calculados por la CLI:

| Turno | Modelo | Caché | Coste |
|-------|--------|-------|-------|
| Seguir en Sonnet | Sonnet | 95 397 leídos, 25 escritos | **0,0097 $** |
| Primer turno tras cambiar a Haiku | Haiku | 27 190 leídos, 68 273 escritos | **0,0139 $** |
| Segundo turno ya en Haiku | Haiku | 95 438 leídos, 406 escritos | **0,0010 $** |

El primer cambio a Haiku cuesta un 43 % más que seguir en Sonnet con la caché caliente (unos 0,004 $ más), pero cada turno siguiente en Haiku cuesta una décima parte.

**Inferencia, no medida:** en esos costes, escribir en la caché de Sonnet sale unas 40 veces más caro que leerla. Si pasan más de 5 minutos entre prompts, la caché de Sonnet caduca y habría que reescribir todo el contexto, con lo que una tarea simple saldría más barata en Haiku todavía. Con estos datos, no bajar de modelo en conversaciones largas (el umbral de 6 prompts) puede estar renunciando a ahorro en lugar de evitar una pérdida. El valor por defecto se mantiene hasta decidirlo con datos de uso real; se ajusta con `maxTurnsToDownshift`.

**Lo que esta verificación no cubre.** Es una ejecución por caso y el coste lo calcula la propia CLI, no es facturación. No se han medido pausas largas entre prompts (caché fría), ni conversaciones con salidas de herramientas voluminosas, ni el flujo interactivo de `/plugin install`, solo su equivalente por terminal.

---

## Riesgos y limitaciones

- **API temprana.** Los mods son recientes y su documentación avisa de que la API puede cambiar sin previo aviso. Verificado solo con Claude Code 2.1.312.
- **Cambiar de modelo tiene un coste, pequeño en lo medido.** La caché de prompt no se comparte entre modelos, así que el primer turno tras un cambio paga el contexto de nuevo. El umbral de 6 prompts es una estimación mía y los datos medidos sugieren que puede ser demasiado conservador.
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
node tests/live/smoke.mjs                        # en vivo, con cuota (≈0,2 $): no entra en CI
```

Los tests de `mods/modslimit-router/test/` cubren el nivel elegido, la decisión por turno, la salvaguarda de conversación larga (incluido el caso de que el contexto inyectado no la dispare), subagentes, comandos, estado inesperado y `/router-stats`.

GitHub Actions (`.github/workflows/ci.yml`) valida los JSON y ejecuta el clasificador contra los fixtures con Node 22 en cada *pull request* y en cada *push* a `main`. `claude plugin validate`, `claude plugin test` y la prueba en vivo necesitan el binario de Claude Code (y esta última, credenciales), así que se ejecutan en local.

---

## Contribuir

Las propuestas de mejora son bienvenidas mediante *issues* o *pull requests*. Para cambios en las reglas, añade a `tests/fixtures/prompts.json` los prompts mal clasificados con su nivel esperado y comprueba que pasan los comandos de arriba.

---

## Licencia

Distribuido bajo la licencia [MIT](LICENSE). © 2026 jmstudio14.
