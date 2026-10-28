# Política de enrutamiento de modelos

La sesión principal corre en **Sonnet** (`.claude/settings.json`). En cada prompt, el hook
`.claude/router/classify.py` añade una línea `[router] nivel=...`. Síguela así:

| Nivel  | Cuándo                                                        | Qué hacer |
|--------|---------------------------------------------------------------|-----------|
| haiku  | Formatear, limpiar datos, renombrar, convertir formatos       | Delegar en `haiku-simple` solo si es autocontenida; si no, hacerla aquí |
| sonnet | Funciones, bugs, tests, lógica general (por defecto)          | Resolver aquí, sin delegar |
| opus   | Arquitectura, refactor masivo, algoritmos avanzados, concurrencia | Delegar el diseño en `opus-critical` y ejecutar aquí su plan |

Reglas:
- El hook es una pista por palabras clave, no una orden. Si el contenido real contradice el
  nivel, corrígelo y dilo en una línea.
- Si un subagente responde `ESCALAR: ...`, reasigna al nivel superior.
- El usuario puede forzar el nivel empezando el prompt con `!haiku`, `!sonnet` u `!opus`.
