# Modslimit

Mods para Claude Code que reducen el consumo de cuota/coste. El primero es un **router de modelos en 3 niveles**:

| Nivel  | Modelo | Para qué |
|--------|--------|----------|
| Simple | Haiku  | Formatear texto, limpiar datos, renombrar, convertir formatos |
| Estándar (por defecto) | Sonnet | Funciones, bugs, tests, lógica general |
| Crítico | Opus  | Arquitectura, refactorización masiva, algoritmos avanzados, concurrencia |

## Cómo funciona

Claude Code no puede cambiar el modelo de la sesión principal en cada prompt. El router se apoya en lo que sí admite:

1. **La sesión principal corre en Sonnet** (`.claude/settings.json`). Esto, por sí solo, es lo que más ahorra.
2. **Un hook `UserPromptSubmit`** (`.claude/router/classify.py`) clasifica cada prompt por palabras clave, en local y sin llamar a ninguna API, y añade una pista como `[router] nivel=opus (coincide: arquitectura)`.
3. **Subagentes con modelo fijo** (`.claude/agents/`): la sesión delega en `haiku-simple` u `opus-critical` según la pista y las reglas de `CLAUDE.md`.

```
prompt ──▶ classify.py ──▶ [router] nivel=X ──▶ sesión Sonnet
                                                 ├─ haiku  → subagente haiku-simple (si es autocontenida)
                                                 ├─ sonnet → la resuelve ella misma
                                                 └─ opus   → subagente opus-critical diseña, Sonnet ejecuta
```

## Instalación

Requisitos: Claude Code y `python3`.

1. Copia `.claude/` y `CLAUDE.md` a la raíz de tu proyecto. Si ya tienes un `.claude/settings.json` o un `CLAUDE.md`, fusiona su contenido en lugar de sobrescribirlos.
2. Abre `claude` en ese directorio y aprueba el hook si te lo pide.
3. Comprueba la instalación:
   - `/model` muestra Sonnet.
   - `/agents` lista `haiku-simple`, `sonnet-standard` y `opus-critical`.
   - Al enviar un prompt aparece la línea `[router] nivel=...`.

## Uso

Escribe normalmente; el router sugiere el nivel. Para forzarlo, empieza el prompt con:

- `!haiku` · `!sonnet` · `!opus`

Los comandos que empiezan por `/` no se clasifican.

## Personalización

Edita `.claude/router/rules.json`:

- `tiers.<nivel>.keywords`: palabras clave de cada nivel. Coinciden por subcadena, sin distinguir mayúsculas ni tildes.
- `default_tier`: nivel cuando nada coincide (por defecto `sonnet`).
- `max_prompt_chars_for_haiku`: un prompt más largo nunca va a Haiku.

Opus se evalúa antes que Haiku: si un prompt coincide con ambos, gana Opus.

Prueba una regla sin abrir Claude:

```bash
echo '{"prompt": "renombra estas variables"}' | python3 .claude/router/classify.py
```

## Limitaciones

- **La clasificación por palabras clave es aproximada.** "Renombra el módulo y rediseña sus interfaces" contiene "renombra" pero no es simple. La pista no es una orden: el modelo puede corregirla.
- **Delegar tiene coste.** Cada subagente empieza sin contexto y vuelve a leer archivos; en tareas pequeñas sale más barato resolverlas en la sesión principal.
- **El ahorro no está medido.** Usa `/cost` o `/usage` durante un tiempo y ajusta las reglas con los fallos reales.
- Si el hook falla (JSON inválido, `rules.json` roto), no bloquea el prompt: simplemente no añade la pista.

## Estructura

```
.claude/
├── settings.json          # modelo principal + registro del hook
├── router/
│   ├── classify.py        # clasificador
│   └── rules.json         # reglas editables
└── agents/
    ├── haiku-simple.md
    ├── sonnet-standard.md
    └── opus-critical.md
CLAUDE.md                  # política de enrutamiento para la sesión
```

## Licencia

[MIT](LICENSE)
