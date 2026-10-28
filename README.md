# Modslimit

**Enrutamiento de modelos por complejidad para Claude Code.** Asigna cada tarea al modelo adecuado —Haiku, Sonnet u Opus— para reducir el consumo de cuota y coste sin renunciar a calidad en el trabajo crítico.

[![CI](https://github.com/jmstudio14/Modslimit/actions/workflows/ci.yml/badge.svg)](https://github.com/jmstudio14/Modslimit/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-3776AB.svg)
![Claude Code](https://img.shields.io/badge/Claude%20Code-hooks%2C%20subagents%20%26%20mods-D97757.svg)

---

## Índice

- [Descripción general](#descripción-general)
- [Mod experimental](#mod-modslimit-router-experimental)
- [Alternativa sin mods: hook y subagentes](#alternativa-sin-mods-hook-y-subagentes)
- [Requisitos](#requisitos)
- [Instalación de la alternativa con hook](#instalación-de-la-alternativa-con-hook)
- [Verificación](#verificación)
- [Uso](#uso)
- [Configuración](#configuración)
- [Solución de problemas](#solución-de-problemas)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Desarrollo](#desarrollo)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

---

## Descripción general

Modslimit clasifica cada prompt en uno de tres niveles y dirige el trabajo al modelo correspondiente:

| Nivel | Modelo | Casos de uso | Estrategia |
|-------|--------|--------------|------------|
| **Simple** | Claude Haiku | Formateo de texto, limpieza de datos, renombrados, conversión de formatos | Delegación a subagente si la tarea es autocontenida |
| **Estándar** *(por defecto)* | Claude Sonnet | Desarrollo de funciones, corrección de errores, tests, lógica de negocio | Resolución directa en la sesión principal |
| **Crítico** | Claude Opus | Diseño de arquitectura, refactorización a gran escala, algoritmos avanzados, concurrencia | Opus diseña el plan; Sonnet lo ejecuta |

**Dos vías, un mismo conjunto de reglas**

| Vía | Cómo actúa | Cuándo usarla |
|-----|------------|---------------|
| **Mod** *(recomendada)* | Cambia de verdad el modelo de cada turno | Claude Code 2.1.275 o posterior, con soporte de mods |
| **Hook y subagentes** | Sugiere un nivel y pide al modelo que delegue | Cualquier versión, sin mods |

**Características principales**

- Clasificación local y determinista: sin llamadas a la API ni latencia añadida.
- Reglas configurables en un único archivo JSON.
- Selección manual del nivel mediante prefijos (`!haiku`, `!sonnet`, `!opus`).
- Escalado automático *(vía hook)*: los subagentes devuelven `ESCALAR` cuando una tarea supera su nivel.
- Tolerante a fallos: un error del clasificador nunca bloquea el prompt y el turno sigue con el modelo de la sesión.

---

## Mod `modslimit-router` (experimental)

En versiones de Claude Code con soporte de mods, `mods/modslimit-router/` **elige** el modelo en lugar de sugerirlo. Es la corrección del punto débil del hook: la recomendación del hook depende de que el modelo la obedezca; el mod no.

| Evento | Qué hace |
|--------|----------|
| `turn.start` | Clasifica el prompt con las mismas reglas que el hook y guarda la decisión en el estado de la sesión |
| `turn.step` | Reescribe el modelo de cada petición del turno. La decisión se toma una vez por turno y vale para todos sus pasos |
| `turn.complete` | Anota los tokens reales de cada turno (últimos 200) para poder medir el ahorro |
| `/router-stats` | Muestra turnos y tokens por nivel |

**Salvaguardas.** No baja a Haiku si la conversación supera `maxContextMessages` mensajes (12 por defecto, configurable), salvo que fuerces el nivel con `!haiku`. No toca los subagentes, ni los comandos de barra, ni los turnos sin prompt escrito. Si algo falla, el turno sigue con el modelo de la sesión. Según el validador, el mod solo usa `$.state`, `$.store`, `$.clock`, `$.command` y `$.ui`: no accede a red, procesos ni archivos.

### Instalación

```
/plugin install modslimit-router --marketplace jmstudio14/Modslimit
```

Desde un terminal, sin abrir Claude Code: `claude plugin install modslimit-router --marketplace jmstudio14/Modslimit`. En la app de escritorio, donde `/plugin` no funciona: **+** junto al cuadro de texto, **Plugins**, **Add marketplace** con `jmstudio14/Modslimit`, y después **Add plugin**.

Verás, por orden: `Add marketplace?` (responde `y`), los detalles del plugin con el ámbito de usuario primero (Enter), una pantalla para fijar `maxContextMessages` y, al final, `Installed modslimit-router. Plugin is now active.` Se activa en la sesión actual sin reiniciar.

Para probarlo sin instalarlo, o mientras lo modificas: `claude --plugin-dir mods/modslimit-router`.

### Verificado en una sesión real

Se ejecutó `claude -p` con el mod cargado desde una carpeta sin hook ni `CLAUDE.md`, y se leyó a qué modelo fue la petición principal (el prompt fijo de Claude Code, unos 43 000 tokens). Un control sin el mod da la referencia:

| Prompt | Mod | Modelo de la petición principal | Coste según la CLI |
|--------|-----|--------------------------------|--------------------|
| `Renombra la variable x a total…` | no | Sonnet | 0,071 $ |
| `Renombra la variable x a total…` | sí | **Haiku** | 0,004 $ |
| `Implementa una función Python que sume dos números` | sí | Sonnet (sin cambio) | 0,076 $ |
| `!opus responde solo OK` | sí | **Opus** | 0,141 $ |

Haiku aparece también en el control, pero con unos 1 200 tokens: es el que Claude Code usa para sus tareas internas. Lo que prueba el enrutamiento es dónde fue la petición grande.

**Lo que esta prueba no cubre.** Es una sola ejecución por caso. El coste lo calcula la propia CLI, no es facturación. Y son turnos sueltos: no mide qué pasa con la caché de prompt en una conversación larga que cambia de modelo, que es el riesgo principal de abajo.

> **Usa el mod o la alternativa con hook, no las dos.** Con el mod activo el modelo del turno ya está elegido; si el hook y `CLAUDE.md` siguen pidiendo delegar en `haiku-simple` u `opus-critical`, el subagente se suma al cambio de modelo y el trabajo se paga dos veces. Si ya habías copiado la alternativa a tu proyecto, quita el bloque `hooks` de `.claude/settings.json` y la tabla de enrutamiento de `CLAUDE.md` antes de instalar el mod. Instalarlo desde el marketplace no copia nada de eso.

**Estado y riesgos**

- **API temprana.** Los mods son recientes y su documentación avisa de que la API puede cambiar sin previo aviso. El mod está verificado con Claude Code 2.1.312.
- **Cambiar de modelo tiene un coste.** La caché de prompt no se comparte entre modelos, así que cada cambio obliga a volver a pagar el contexto. De ahí la decisión por turno y el límite de contexto para bajar a Haiku. Si ese umbral es demasiado alto, el cambio puede salir más caro que no hacerlo.
- **El ahorro no está medido.** `/router-stats` da los tokens por nivel, no el coste: no incluye precios a propósito, porque se quedarían obsoletos. Compáralo con `/cost` antes de fiarte.
- **Dos clasificadores.** El hook (Python) y el mod (TypeScript) implementan las mismas reglas. Los fixtures de `tests/fixtures/prompts.json` y la comprobación de `rules.ts` en CI evitan que diverjan.

---

## Alternativa sin mods: hook y subagentes

Con hooks, Claude Code no puede cambiar el modelo de la sesión principal en cada prompt. Esta vía, compatible con cualquier versión, combina tres mecanismos nativos para lograr un efecto equivalente. Si tu versión admite mods, usa [el mod](#mod-modslimit-router-experimental), que sí cambia el modelo:

```
                ┌─────────────────────────┐
  prompt ─────▶ │ Hook UserPromptSubmit   │  classify.py + rules.json
                └────────────┬────────────┘
                             │  [router] nivel=X (motivo)
                             ▼
                ┌─────────────────────────┐
                │ Sesión principal        │  modelo: Sonnet
                │ (política: CLAUDE.md)   │
                └───┬─────────┬─────────┬─┘
              haiku │  sonnet │    opus │
                    ▼         ▼         ▼
             haiku-simple  (inline)  opus-critical
```

| Componente | Ruta | Responsabilidad |
|------------|------|-----------------|
| Configuración | `.claude/settings.json` | Fija Sonnet como modelo principal y registra el hook |
| Clasificador | `.claude/router/classify.py` | Analiza el prompt y emite la recomendación de nivel |
| Reglas | `.claude/router/rules.json` | Palabras clave, nivel por defecto y prefijos manuales |
| Subagentes | `.claude/agents/*.md` | Agentes con modelo fijo: `haiku-simple`, `sonnet-standard`, `opus-critical` |
| Política | `CLAUDE.md` | Instrucciones de enrutamiento para la sesión principal |
| Mod *(experimental)* | `mods/modslimit-router/` | Elige el modelo de cada turno en vez de sugerirlo |
| Generador | `scripts/sync_mod_rules.py` | Copia `rules.json` a `rules.ts`, porque el mod no puede leer archivos |
| Tests | `tests/` | Suite de verificación del clasificador, la configuración y la paridad con el mod |
| CI | `.github/workflows/ci.yml` | Ejecución automática de la suite en cada cambio |

> **Nota:** fijar Sonnet como modelo principal es, en principio, la medida de mayor impacto, porque la sesión principal concentra la mayor parte del gasto. Es una estimación, no una medición; el enrutamiento por niveles puede optimizar el resto.

---

## Requisitos

- [Claude Code](https://code.claude.com) con soporte de hooks y subagentes.
- Python 3.10 o superior disponible como `python3` en el `PATH`.
- Sin dependencias externas: solo biblioteca estándar.
- Para el mod: Claude Code 2.1.275 o posterior, con soporte de mods (verificado con la 2.1.312). Node 22.18 o superior solo hace falta para los tests de paridad.

---

## Instalación de la alternativa con hook

Solo si no usas el mod:

```bash
git clone https://github.com/jmstudio14/Modslimit.git
cp -r Modslimit/.claude Modslimit/CLAUDE.md /ruta/a/tu/proyecto/
```

> **Importante:** si tu proyecto ya tiene `.claude/settings.json` o `CLAUDE.md`, **fusiona** su contenido manualmente en lugar de sobrescribirlos.

Inicia Claude Code en el directorio del proyecto. La primera vez puede solicitar que apruebes el hook.

---

## Verificación

**Del mod:** tras instalarlo, envía un prompt simple (`Renombra la variable x a total`) y comprueba que la barra de estado dice `router: haiku`. Con `/router-stats` verás los tokens por nivel de los últimos turnos.

**De la alternativa con hook:**

| Comprobación | Resultado esperado |
|--------------|--------------------|
| `/model` | Sonnet como modelo activo |
| `/agents` | `haiku-simple`, `sonnet-standard`, `opus-critical` |
| Enviar cualquier prompt | Aparece la línea `[router] nivel=...` en el contexto |

Prueba del clasificador desde la terminal, sin abrir Claude Code:

```bash
echo '{"prompt": "renombra estas variables"}' | python3 .claude/router/classify.py
# [router] nivel=haiku (coincide: renombra). Tarea SIMPLE. ...
```

---

## Uso

El enrutamiento es automático. Para forzar un nivel concreto, inicia el prompt con un prefijo:

| Prefijo | Efecto |
|---------|--------|
| `!haiku` | Fuerza el nivel simple |
| `!sonnet` | Fuerza el nivel estándar |
| `!opus` | Fuerza el nivel crítico |

Los comandos de barra (`/help`, `/model`, etc.) se excluyen de la clasificación.

---

## Configuración

Todas las reglas residen en `.claude/router/rules.json`:

| Clave | Tipo | Descripción |
|-------|------|-------------|
| `default_tier` | `string` | Nivel asignado cuando no hay coincidencias. Por defecto: `sonnet` |
| `overrides` | `object` | Prefijos de selección manual y su nivel asociado |
| `tiers.<nivel>.agent` | `string` | Subagente al que se delega el nivel |
| `tiers.<nivel>.keywords` | `string[]` | Palabras clave del nivel (subcadena; sin distinción de mayúsculas ni tildes) |
| `tiers.<nivel>.min_hits` | `integer` | Coincidencias mínimas para asignar el nivel |
| `max_prompt_chars_for_haiku` | `integer` | Longitud máxima de un prompt para asignarlo a Haiku |

**Orden de evaluación:** prefijo manual → Opus → Haiku → nivel por defecto. Ante coincidencias en ambos niveles, prevalece Opus.

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| No aparece la línea `[router]` | Hook no aprobado o `python3` no disponible | Revisa `/hooks` y ejecuta el clasificador manualmente desde la terminal |
| `/agents` no muestra los subagentes | `.claude/agents/` fuera de la raíz del proyecto | Verifica la ruta y reinicia la sesión |
| Clasificación incorrecta recurrente | Palabras clave demasiado amplias o insuficientes | Ajusta `rules.json` o usa un prefijo manual |
| El hook deja de funcionar tras editar reglas | JSON inválido en `rules.json` | Valida con `python3 -m json.tool .claude/router/rules.json` |

---

## Limitaciones conocidas

- **Precisión heurística.** La clasificación por palabras clave no interpreta la intención: *«renombra el módulo y rediseña sus interfaces»* se detectaría como simple. La recomendación es orientativa y la sesión principal puede corregirla.
- **Coste de delegación.** Cada subagente arranca sin contexto y relee archivos; en tareas breves resulta más eficiente resolverlas en la sesión principal.
- **Ahorro no cuantificado.** El impacto real depende del perfil de uso. Se recomienda medirlo con `/cost` o `/usage` antes de ajustar las reglas.

---

## Desarrollo

```bash
python3 -m unittest discover -s tests -v          # clasificador Python, fixtures y coherencia
node --test tests/test_classify_ts.mjs            # clasificador del mod contra los mismos fixtures
python3 scripts/sync_mod_rules.py                 # regenera rules.ts tras tocar rules.json
claude plugin validate mods/modslimit-router      # manifiesto y llamadas del mod a $
claude plugin test mods/modslimit-router          # hooks del mod contra el motor
```

| Suite | Cubre |
|-------|-------|
| `tests/test_classify.py` | Asignación de niveles, prioridad Opus > Haiku, insensibilidad a mayúsculas y tildes, prefijos manuales, límite de longitud, regresiones de falsos positivos y comportamiento del hook ante entradas vacías, comandos de barra o JSON inválido |
| `tests/test_config.py` | Coherencia entre `settings.json`, `rules.json` y los subagentes: modelos válidos, agentes existentes, *frontmatter* correcto y palabras clave sin duplicados |
| `tests/test_parity_fixtures.py` y `tests/test_classify_ts.mjs` | Los mismos 20 prompts de `tests/fixtures/prompts.json` dan el mismo nivel en Python y en TypeScript, incluido el límite de longitud medido en caracteres |
| `tests/test_mod_sync.py` | `rules.ts` es exactamente lo que genera `rules.json` |
| `mods/modslimit-router/test/` | Los hooks del mod: nivel elegido, decisión por turno, límite de contexto, subagentes, comandos, estado inesperado y `/router-stats` |

GitHub Actions (`.github/workflows/ci.yml`) valida los JSON, ejecuta la suite de Python con 3.10 y 3.13 y la paridad en TypeScript con Node 22, en cada *pull request* y en cada *push* a `main`. `claude plugin validate`, `claude plugin test` y `tsc` necesitan el binario de Claude Code y las declaraciones de tipos que él mismo escribe, así que se ejecutan en local.

---

## Contribuir

Las propuestas de mejora son bienvenidas mediante *issues* o *pull requests*. Para cambios en las reglas, añade a `tests/fixtures/prompts.json` los prompts mal clasificados con su nivel esperado, ejecuta `python3 scripts/sync_mod_rules.py` y comprueba que pasan las dos suites.

---

## Licencia

Distribuido bajo la licencia [MIT](LICENSE). © 2026 jmstudio14.
