// Generado por scripts/sync_mod_rules.py desde .claude/router/rules.json.
// No lo edites a mano: cambia rules.json y vuelve a ejecutar el script.
import type { Rules } from './classify.ts'

export const RULES: Rules = {
  "default_tier": "sonnet",
  "overrides": {
    "!haiku": "haiku",
    "!sonnet": "sonnet",
    "!opus": "opus"
  },
  "tiers": {
    "opus": {
      "agent": "opus-critical",
      "min_hits": 1,
      "keywords": [
        "arquitectura",
        "architecture",
        "diseño del sistema",
        "diseno del sistema",
        "system design",
        "refactorizacion masiva",
        "refactor masivo",
        "refactorizar todo",
        "large refactor",
        "migracion completa",
        "migrar todo",
        "algoritmo avanzado",
        "complejidad algoritmica",
        "optimizacion de rendimiento critica",
        "concurrencia",
        "race condition",
        "condicion de carrera",
        "deadlock",
        "sistema distribuido",
        "distributed",
        "criptografia",
        "modelo de seguridad",
        "threat model"
      ]
    },
    "haiku": {
      "agent": "haiku-simple",
      "min_hits": 1,
      "keywords": [
        "formatea",
        "reformat",
        "format this",
        "renombra",
        "renombrar",
        "rename",
        "limpia los datos",
        "limpiar datos",
        "limpieza de datos",
        "clean up data",
        "ordena alfabeticamente",
        "convierte a json",
        "convierte a csv",
        "convertir a markdown",
        "corrige la ortografia",
        "typo",
        "traduce",
        "traducir",
        "resume este",
        "resumir",
        "quita espacios",
        "elimina duplicados",
        "cambia el nombre"
      ]
    }
  },
  "max_prompt_chars_for_haiku": 1500
}
