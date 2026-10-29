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
- [Barra de uso](#barra-de-uso)
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
| **Estándar** *(por defecto)* | Claude Sonnet | Funciones, errores, tests, lógica de negocio |
| **Crítico** | Claude Opus | Diseño de arquitectura, refactorización a gran escala, algoritmos avanzados, concurrencia |

> **Lo estándar usa Sonnet siempre**, aunque tu sesión arranque con otro modelo (por ejemplo, al reanudar una sesión cuyo último turno fue en Opus). Si prefieres que el mod no toque el modelo de la sesión, pon `standardModel` en `session` (ver [Configuración](#configuración)).

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

Lanza `claude -p` desde una carpeta vacía con cuatro casos y comprueba el modelo de la petición principal y lo que anuncia el mod: simple a Haiku, estándar a Sonnet, `!opus` a Opus y `reanudar` (un turno en Haiku y, reanudando la sesión, otro estándar que debe volver a Sonnet). Gasta unos 0,3 $ de cuota según la CLI. Con el mod cargado desde una carpeta, añade `--plugin-dir mods/modslimit-router` y no lo tengas instalado a la vez.

---

## Uso

El enrutamiento es automático. Para forzar un nivel, inicia el prompt con un prefijo:

| Prefijo | Efecto |
|---------|--------|
| `!haiku` | Fuerza Haiku, aunque la conversación sea larga |
| `!sonnet` | Fuerza Sonnet |
| `!opus` | Fuerza Opus |

- **Línea de estado** (abajo del todo en Claude Code). Lleva el modelo en uso, el contexto, los límites del plan y lo gastado: ver [Barra de uso](#barra-de-uso). Cuando una tarea simple se queda en Sonnet por ser la conversación larga, lo dice: `Sonnet (router) · conversación larga, no baja a Haiku · …`. Además, un aviso (`toast`) cuando el modelo cambia respecto al que traía la petición. Al subir a Opus en una conversación larga, el aviso añade que, si la caché de Opus ya caducó, ese turno paga de nuevo todo el contexto.
- **`/router-stats`** resume los tokens por nivel de los últimos 200 turnos. No incluye precios a propósito, porque se quedarían obsoletos: compáralo con `/cost`.

Los comandos de barra (`/help`, `/model`…) y los turnos sin prompt escrito no se enrutan, ni los subagentes.

---

## Barra de uso

Desde la 0.4.0 el mod enseña qué modelo usa y cuánto llevas gastado y te queda:

```text
Haiku (router) · ctx 43,1k/1M 4 % · 5 h 86 % · 7 d 59 % · 17,1k tok · <0,01 $
```

| Dato | Qué es | De dónde sale |
|------|--------|---------------|
| `Haiku (router)` | Modelo de la petición; `(router)` si lo cambió el mod | El que fija el mod, y al terminar el turno el que informa la API |
| `ctx 43,1k/1M 4 %` | Contexto ocupado y ventana del modelo | `$.session.usage()` |
| `5 h 86 %`, `7 d 59 %` | Porcentaje usado de los límites de tu plan | `$.session.usage()`; solo con suscripción |
| `17,1k tok` | **Gastado**: entrada nueva + escritura de caché + salida, **sin** lecturas de caché | Suma de cada turno desde que el mod se cargó |
| `<0,01 $` | Coste de la sesión | `$.session.usage()` |

- **Dónde sale.** La línea de estado, en todas las superficies que la dibujan. Además, una banda sobre el cuadro de texto en **escritorio**, con la hora de reinicio de cada límite (`5 h: 86 % · reinicia en 2 h 10 min`). En el terminal la banda cede el sitio, porque allí la línea de abajo ya lo cubre; VS Code y móvil no la reciben.
- **Colores.** Contexto y límites pasan a aviso desde el 80 % y a alerta desde el 95 %.
- **Lo que te queda del plan está en porcentaje, no en tokens.** La API de mods no da el límite del plan en tokens, solo el porcentaje usado y cuándo se reinicia. Con clave de API (sin suscripción) no hay límites y se omiten.
- **"Gastado" cuenta desde que el mod se carga.** En una sesión reanudada no incluye lo anterior; el coste en $ sí es el de toda la sesión. Las lecturas de caché no se suman porque se repiten en cada turno y casi no cuestan: por eso el primer turno de una sesión muestra decenas de miles (la escritura del prompt de sistema).
- **Desactivarla:** `showMeter` en `false` (ver [Configuración](#configuración)).
- **No verificado:** el aspecto de la banda en escritorio. El texto de la línea de estado está comprobado con `claude -p` y la banda con el kit de pruebas del motor, no en una ventana real.

---

## Cómo funciona

| Evento | Qué hace |
|--------|----------|
| `turn.start` | Clasifica el prompt y decide el modelo del turno entero, una sola vez. Lo guarda en el estado de la sesión |
| `turn.step` | Reescribe el modelo de cada petición del turno con esa decisión |
| `turn.complete` | Anota los tokens reales del turno y suma lo gastado |
| `session.measure` | Refresca contexto, límites y coste de la barra de uso |
| `ui.render` (`AbovePrompt`) | Dibuja la banda de uso en escritorio |
| `/router-stats` | Muestra turnos y tokens por nivel |

Se decide una vez por turno para no cambiar de modelo a mitad de tarea. Si algo falla, el turno sigue con el modelo que traiga la petición. Según el validador del propio Claude Code, el mod solo usa `$.state`, `$.store`, `$.clock`, `$.command`, `$.session` y `$.ui`: no accede a red, procesos ni archivos.

**Estándar es Sonnet de forma explícita.** Dejar "el modelo de la sesión" no es estable: en la prueba con `claude -p --resume`, cada proceso reanudado arrancó con el modelo del turno anterior (Haiku, Opus, Opus, Haiku y Opus en los cinco pasos), es decir, el que el propio mod había forzado. Un prompt estándar tras un turno en Opus se quedaba en Opus. Se midió con un proceso nuevo por turno; no se ha verificado si ocurre en una sesión interactiva sin reiniciar, aunque es de esperar para quien use `claude --resume` o `--continue`.

**Salvaguarda de conversación larga.** No baja a Haiku si la persona ya ha enviado más de `maxTurnsToDownshift` prompts (6 por defecto), salvo con `!haiku`. Cambiar de modelo obliga a volver a pagar el contexto en el modelo nuevo; lo medido (ver [Qué cuesta cambiar de modelo](#qué-cuesta-cambiar-de-modelo-medido)) indica que el primer cambio cuesta algo más y los turnos siguientes mucho menos, así que este umbral es una cautela y no un coste demostrado. Se mide con los prompts enviados y no con los mensajes de la petición, porque estos incluyen el contexto que inyecta el motor (instrucciones del proyecto, avisos) y una sesión recién abierta ya puede llevar decenas.

---

## Configuración

Las reglas están en `mods/modslimit-router/hooks/rules.ts`, con comentarios:

| Clave | Descripción |
|-------|-------------|
| `default_tier` | Nivel cuando nada coincide. Por defecto `sonnet` |
| `overrides` | Prefijos de selección manual y su nivel |
| `tiers.<nivel>.keywords` | Palabras clave del nivel: subcadena, sin distinguir mayúsculas ni tildes |
| `tiers.<nivel>.min_hits` | Coincidencias mínimas para asignar el nivel |
| `max_prompt_chars_for_haiku` | Un prompt más largo que esto nunca va a Haiku |

**Orden de evaluación:** prefijo manual, Opus, Haiku y nivel por defecto. Ante coincidencias en ambos niveles, gana Opus.

Desde el menú de configuración del plugin se ajustan:

| Opción | Valores | Efecto |
|--------|---------|--------|
| `maxTurnsToDownshift` | número, 6 por defecto | Prompts máximos para bajar a Haiku |
| `showMeter` | `true` (por defecto) o `false` | Muestra u oculta la [barra de uso](#barra-de-uso) |
| `standardModel` | `sonnet` (por defecto) o `session` | `sonnet`: lo estándar usa Sonnet siempre. `session`: no se toca el modelo de la petición; al reanudar, ese modelo es el del último turno |

---

## Verificado en una sesión real

### Instalación real (versión 0.2.0)

El mod se instaló por la vía documentada (`claude plugin install modslimit-router --marketplace jmstudio14/Modslimit`, ámbito de usuario) y se ejecutó `claude -p` desde una carpeta vacía, sin `--plugin-dir`, leyendo a qué modelo fue la petición principal. Un control sin el mod da la referencia. En esa versión lo estándar no cambiaba el modelo; la 0.3.0 lo fija en Sonnet:

| Prompt | Mod | Modelo de la petición principal | Coste según la CLI |
|--------|-----|--------------------------------|--------------------|
| `Renombra la variable x a total…` | no | Sonnet | 0,071 $ |
| `Renombra la variable x a total…` | sí | **Haiku** · `router: haiku · turno 1` | 0,004 $ |
| `Explica en una frase qué es una variable` | sí | Sonnet (el de la sesión), sin aviso | 0,065 $ |
| `!opus responde solo OK` | sí | **Opus** · `router: opus · turno 1` | 0,130 $ |

- **Salvaguarda de conversación larga, en vivo.** En una sesión de 8 prompts, los 7 primeros (estándar) se quedaron en Sonnet y el 8.º, simple, mostró `router: sin cambio, conversación larga · turno 8` y no bajó de modelo.
- **Cambio a mitad de conversación.** Con un primer prompt estándar y un segundo simple en la misma sesión, el segundo mostró `router: haiku · turno 2` y fue a Haiku.
- **Coste fijo.** Según `claude plugin details`, instalarlo añade 0 tokens a cada sesión.

Haiku aparece también sin el mod, pero con unos 1 200 tokens: es el que Claude Code usa para sus tareas internas. Lo que prueba el enrutamiento es dónde fue la petición grande.

### Versión 0.3.0, a través de tres modelos en una misma conversación

Con el mod cargado con `--plugin-dir`, `node tests/live/smoke.mjs` pasa sus cuatro casos (0,27 $ según la CLI). Además, cinco turnos reanudados sobre una misma sesión de ~43 000 tokens, cada uno en un proceso nuevo:

| Turno | El proceso arrancó con | Modelo de la petición principal | Coste |
|-------|------------------------|--------------------------------|-------|
| `!opus` | Sonnet | **Opus** | 0,1359 $ |
| Estándar, justo después | **Opus** | **Sonnet** | 0,0062 $ |
| `!haiku` | Sonnet | **Haiku** | 0,0037 $ |
| «…arquitectura del sistema» (palabra clave) | Haiku | **Opus** | 0,0182 $ |
| Simple, con más de 6 prompts | Opus | **Sonnet** (frenado) | 0,0094 $ |

La segunda fila es la importante: el proceso arrancó en Opus y el mod llevó la petición a Sonnet. Con la 0.2.0, ese mismo turno se quedaba en Opus. La cuarta es la primera subida a Opus por palabra clave comprobada en vivo; las anteriores usaban el prefijo `!opus`.

### Qué cuesta cambiar de modelo (medido)

En una conversación de unos 95 000 tokens de contexto, con una ejecución por celda y costes calculados por la CLI:

| Turno | Modelo | Caché | Coste |
|-------|--------|-------|-------|
| Seguir en Sonnet | Sonnet | 95 397 leídos, 25 escritos | **0,0097 $** |
| Primer turno tras cambiar a Haiku | Haiku | 27 190 leídos, 68 273 escritos | **0,0139 $** |
| Segundo turno ya en Haiku | Haiku | 95 438 leídos, 406 escritos | **0,0010 $** |

El primer cambio a Haiku cuesta un 43 % más que seguir en Sonnet con la caché caliente (unos 0,004 $ más), pero cada turno siguiente en Haiku cuesta una décima parte.

**Inferencia, no medida:** en esos costes, escribir en la caché de Sonnet sale unas 40 veces más caro que leerla. Si pasan más de 5 minutos entre prompts, la caché de Sonnet caduca y habría que reescribir todo el contexto, con lo que una tarea simple saldría más barata en Haiku todavía. Con estos datos, no bajar de modelo en conversaciones largas (el umbral de 6 prompts) puede estar renunciando a ahorro en lugar de evitar una pérdida. El valor por defecto se mantiene hasta decidirlo con datos de uso real; se ajusta con `maxTurnsToDownshift`.

### Qué cuesta subir a Opus (medido)

Sobre la misma conversación de ~96 000 tokens, una ejecución por celda:

| Turno | Caché | Coste |
|-------|-------|-------|
| Primer turno en Opus | 27 190 leídos, 68 694 escritos | **0,5551 $** |
| Siguiente turno en Opus, caché caliente | 95 859 leídos, 399 escritos | 0,0225 $ |
| (referencia) seguir en Sonnet, caché caliente | 95 397 leídos, 25 escritos | 0,0097 $ |

El primer turno en Opus sobre un contexto grande con la caché fría cuesta unas 57 veces más que seguir en Sonnet con la caché caliente. Por eso el mod avisa al subir a Opus en una conversación larga; no lo bloquea, porque Opus existe para lo crítico. En cambio, una vez caliente, un turno en Opus cuesta unas 2,3 veces el de Sonnet.

**Lo que esta verificación no cubre.** Es una ejecución por caso y el coste lo calcula la propia CLI, no es facturación. No se han medido pausas largas entre prompts (caché fría de Sonnet), ni conversaciones con salidas de herramientas voluminosas, ni el flujo interactivo de `/plugin install` (solo su equivalente por terminal), ni el arrastre del modelo al reanudar en una sesión interactiva.

---

## Riesgos y limitaciones

- **API temprana.** Los mods son recientes y su documentación avisa de que la API puede cambiar sin previo aviso. Verificado solo con Claude Code 2.1.312.
- **Cambiar de modelo tiene un coste, pequeño en lo medido.** La caché de prompt no se comparte entre modelos, así que el primer turno tras un cambio paga el contexto de nuevo. El umbral de 6 prompts es una estimación mía y los datos medidos sugieren que puede ser demasiado conservador.
- **Subir a Opus en una conversación larga puede costar mucho.** Medido: 0,56 $ el primer turno con ~96 000 tokens. El mod avisa, no bloquea.
- **El ahorro no está medido.** `/router-stats` da tokens, no dinero.
- **Precisión heurística.** La clasificación por palabras clave no interpreta la intención: *«renombra el módulo y rediseña sus interfaces»* se tomaría como simple. Los prefijos `!haiku`, `!sonnet` y `!opus` están para corregirlo.

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| No aparece la línea de uso | El mod no está activo o `showMeter` está en `false` | Comprueba que `/router-stats` existe; prueba con `!opus responde OK` |
| Las tareas simples siguen en Sonnet | Llevas más de `maxTurnsToDownshift` prompts en la sesión | Súbelo en la configuración del plugin o fuerza con `!haiku` |
| Una tarea se clasifica mal | Palabras clave demasiado amplias o escasas | Ajusta `rules.ts` y añade el caso a `tests/fixtures/prompts.json` |
| Quiero que lo estándar respete mi `/model` | Por defecto lo estándar usa Sonnet | Pon `standardModel` en `session` |

---

## Desarrollo

```bash
node --test tests/test_classify_ts.mjs          # clasificador contra tests/fixtures/prompts.json
node --test tests/test_meter.mjs                 # formato de la barra de uso
claude plugin validate .                         # marketplace, manifiesto y llamadas a $
claude plugin test mods/modslimit-router         # hooks del mod contra el motor
node tests/live/smoke.mjs                        # en vivo, con cuota (≈0,3 $): no entra en CI
```

Los tests de `mods/modslimit-router/test/` cubren el nivel elegido, la decisión por turno, la salvaguarda de conversación larga (incluido el caso de que el contexto inyectado no la dispare), el arrastre del modelo al reanudar, `standardModel`, los avisos de Opus, subagentes, comandos, estado inesperado y `/router-stats`. `test/meter.test.tsx` cubre la línea de estado, lo gastado, `session.measure` y la banda (escritorio, terminal, encuesta, `showMeter`).

GitHub Actions (`.github/workflows/ci.yml`) valida los JSON y ejecuta el clasificador y el formato de la barra contra sus tests con Node 22 en cada *pull request* y en cada *push* a `main`. `claude plugin validate`, `claude plugin test` y la prueba en vivo necesitan el binario de Claude Code (y esta última, credenciales), así que se ejecutan en local.

---

## Contribuir

Las propuestas de mejora son bienvenidas mediante *issues* o *pull requests*. Para cambios en las reglas, añade a `tests/fixtures/prompts.json` los prompts mal clasificados con su nivel esperado y comprueba que pasan los comandos de arriba.

---

## Licencia

Distribuido bajo la licencia [MIT](LICENSE). © 2026 jmstudio14.
