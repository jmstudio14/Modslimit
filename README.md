# Modslimit

**Enrutamiento de modelos por complejidad para Claude Code.** Asigna cada tarea al modelo adecuado —Haiku, Sonnet u Opus— para reducir el consumo de cuota y coste sin renunciar a calidad en el trabajo crítico.

[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
![Python 3.8+](https://img.shields.io/badge/python-3.8%2B-3776AB.svg)
![Claude Code](https://img.shields.io/badge/Claude%20Code-hooks%20%26%20subagents-D97757.svg)

---

## Índice

- [Descripción general](#descripción-general)
- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Verificación](#verificación)
- [Uso](#uso)
- [Configuración](#configuración)
- [Solución de problemas](#solución-de-problemas)
- [Limitaciones conocidas](#limitaciones-conocidas)
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

**Características principales**

- Clasificación local y determinista: sin llamadas a la API ni latencia añadida.
- Reglas configurables en un único archivo JSON.
- Selección manual del nivel mediante prefijos (`!haiku`, `!sonnet`, `!opus`).
- Escalado automático: los subagentes devuelven `ESCALAR` cuando una tarea supera su nivel.
- Tolerante a fallos: un error del clasificador nunca bloquea el prompt.

---

## Arquitectura

Claude Code no permite cambiar el modelo de la sesión principal en cada prompt. Modslimit combina tres mecanismos nativos para lograr un efecto equivalente:

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

> **Nota:** fijar Sonnet como modelo principal es, por sí solo, la medida de mayor impacto en el consumo. El enrutamiento por niveles optimiza el resto.

---

## Requisitos

- [Claude Code](https://code.claude.com) con soporte de hooks y subagentes.
- Python 3.8 o superior disponible como `python3` en el `PATH`.
- Sin dependencias externas: solo biblioteca estándar.

---

## Instalación

```bash
git clone https://github.com/jmstudio14/Modslimit.git
cp -r Modslimit/.claude Modslimit/CLAUDE.md /ruta/a/tu/proyecto/
```

> **Importante:** si tu proyecto ya tiene `.claude/settings.json` o `CLAUDE.md`, **fusiona** su contenido manualmente en lugar de sobrescribirlos.

Inicia Claude Code en el directorio del proyecto. La primera vez puede solicitar que apruebes el hook.

---

## Verificación

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

## Contribuir

Las propuestas de mejora son bienvenidas mediante *issues* o *pull requests*. Para cambios en las reglas, incluye ejemplos de prompts mal clasificados y el resultado esperado.

---

## Licencia

Distribuido bajo la licencia [MIT](LICENSE). © 2026 jmstudio14.
