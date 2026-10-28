// Clasificación por palabras clave, local y sin llamadas a la API. Los casos de
// tests/fixtures/prompts.json fijan su comportamiento y los ejecuta CI.
export type Tier = 'haiku' | 'sonnet' | 'opus'

export type Rules = {
  default_tier: Tier
  overrides: Record<string, Tier>
  tiers: Record<'opus' | 'haiku', { min_hits: number; keywords: string[] }>
  max_prompt_chars_for_haiku: number
}

export type Verdict = {
  tier: Tier
  // True si el nivel viene de un prefijo manual (!haiku, !sonnet, !opus).
  isForced: boolean
  reason: string
}

// Minúsculas y sin tildes, para que 'Diseño' y 'diseno' coincidan.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

export function classify(prompt: string, rules: Rules): Verdict {
  const norm = normalize(prompt).trim()

  for (const [prefix, tier] of Object.entries(rules.overrides)) {
    if (norm.startsWith(normalize(prefix))) {
      return { tier, isForced: true, reason: 'override manual' }
    }
  }

  // Opus se evalúa antes que Haiku: ante un empate gana el nivel más caro.
  for (const tier of ['opus', 'haiku'] as const) {
    const cfg = rules.tiers[tier]
    const hits = cfg.keywords.filter(k => norm.includes(normalize(k)))
    if (hits.length < (cfg.min_hits ?? 1)) continue
    // Un prompt largo casi nunca es una tarea mecánica.
    if (tier === 'haiku' && [...prompt].length > rules.max_prompt_chars_for_haiku) continue

    return { tier, isForced: false, reason: `coincide: ${hits.slice(0, 3).join(', ')}` }
  }

  return {
    tier: rules.default_tier,
    isForced: false,
    reason: 'sin coincidencias, nivel por defecto',
  }
}
