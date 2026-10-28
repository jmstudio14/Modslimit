import type { Rules } from './classify.ts'

// Reglas del router. Cualquier cambio aquí debe llevar su caso en
// tests/fixtures/prompts.json.
//
// Las palabras clave coinciden por subcadena, sin distinguir mayúsculas ni
// tildes. El orden de evaluación es: prefijo manual, Opus, Haiku y, si nada
// coincide, `default_tier`. Ante un empate entre Opus y Haiku gana Opus.
export const RULES: Rules = {
  // Nivel cuando nada coincide. "sonnet" significa dejar el modelo de la sesión.
  default_tier: 'sonnet',
  // Prefijos con los que la persona fuerza el nivel de un prompt.
  overrides: {
    '!haiku': 'haiku',
    '!sonnet': 'sonnet',
    '!opus': 'opus',
  },
  tiers: {
    // Tareas críticas, de máxima complejidad.
    opus: {
      min_hits: 1,
      keywords: [
        'arquitectura',
        'architecture',
        'diseño del sistema',
        'diseno del sistema',
        'system design',
        'refactorizacion masiva',
        'refactor masivo',
        'refactorizar todo',
        'large refactor',
        'migracion completa',
        'migrar todo',
        'algoritmo avanzado',
        'complejidad algoritmica',
        'optimizacion de rendimiento critica',
        'concurrencia',
        'race condition',
        'condicion de carrera',
        'deadlock',
        'sistema distribuido',
        'distributed',
        'criptografia',
        'modelo de seguridad',
        'threat model',
      ],
    },
    // Tareas simples y mecánicas.
    haiku: {
      min_hits: 1,
      keywords: [
        'formatea',
        'reformat',
        'format this',
        'renombra',
        'renombrar',
        'rename',
        'limpia los datos',
        'limpiar datos',
        'limpieza de datos',
        'clean up data',
        'ordena alfabeticamente',
        'convierte a json',
        'convierte a csv',
        'convertir a markdown',
        'corrige la ortografia',
        'typo',
        'traduce',
        'traducir',
        'resume este',
        'resumir',
        'quita espacios',
        'elimina duplicados',
        'cambia el nombre',
      ],
    },
  },
  // Un prompt más largo que esto nunca se manda a Haiku.
  max_prompt_chars_for_haiku: 1500,
}
