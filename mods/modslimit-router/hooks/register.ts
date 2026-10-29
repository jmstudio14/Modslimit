import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { Meter, Route } from '../types'
import { registerBand } from './band.tsx'
import { classify } from './classify.ts'
import type { Tier } from './classify.ts'
import { buildStatus } from './meter.ts'
import { RULES } from './rules.ts'

const ROUTE = { plugin: 'modslimit-router', key: 'route' } as const
const METER = { plugin: 'modslimit-router', key: 'meter' } as const
const LOG_KEY = 'turns'
const LOG_LIMIT = 200

type TurnRecord = {
  at: number
  tier: Tier
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

type Step = { turnId: string; index: number; model: string }

// Nivel que corresponde al modelo que el motor dice usar en este paso; undefined
// si el id no menciona ninguno.
const tierOf = (model: string): Tier | undefined =>
  (['haiku', 'sonnet', 'opus'] as const).find(t => model.includes(t))

// El aviso es cosmético: si falla no debe anular el enrutamiento.
function notify($: EngineInterface, toast: string): void {
  try {
    $.ui.toast(toast)
  } catch {
    // sin aviso
  }
}

const EMPTY: Meter = {
  model: null,
  isRouted: false,
  note: null,
  turns: null,
  contextTokens: null,
  contextWindow: null,
  contextPercent: null,
  limits: [],
  costUsd: null,
  spent: 0,
}

// Las cifras que el motor da del uso, en la forma del medidor. Lo que no
// informa se queda como null o vacío.
const fromUsage = (u: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>): Partial<Meter> => ({
  contextTokens: u.context.tokens ?? null,
  contextWindow: u.context.window,
  contextPercent: u.context.percent ?? null,
  limits: u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  costUsd: u.cost?.usd ?? null,
})

// Pone al día el medidor y la línea de estado de abajo. Medir es opcional: ante
// cualquier fallo el turno sigue como si el mod no estuviera. `usage` son las
// cifras del evento; sin ellas se pregunta al motor.
async function track(
  $: EngineInterface,
  isEnabled: boolean,
  patch: Partial<Meter>,
  extra: { spent?: number; usage?: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'> } = {},
): Promise<void> {
  if (!isEnabled) return

  try {
    const { value: prev } = await $.state.get(METER)
    let measured: Partial<Meter> = {}
    try {
      measured = fromUsage(extra.usage ?? (await $.session.usage()))
    } catch {
      // se conserva lo último que se midió
    }

    const meter: Meter = { ...(prev ?? EMPTY), ...measured, ...patch }
    meter.spent = (prev?.spent ?? 0) + (extra.spent ?? 0)

    if (JSON.stringify(prev) !== JSON.stringify(meter)) await $.state.set(METER, meter)

    const line = buildStatus(meter, 0)
    if (line !== '') $.ui.status(line)
  } catch {
    // sin medidor
  }
}

// Prompts que la persona ha enviado en esta sesión. No se mide con el número
// de mensajes de la petición: ese incluye el contexto que inyecta el motor
// (CLAUDE.md, avisos, salida de hooks) y una sesión recién abierta ya puede
// superar cualquier umbral razonable.
async function countTurns($: EngineInterface): Promise<number | null> {
  try {
    return await $.session.turns()
  } catch {
    return null
  }
}

type Config = { maxTurnsToDownshift: number; standardModel: 'sonnet' | 'session'; showMeter: boolean }

// Decide el modelo del turno entero, una sola vez, al empezar.
async function decide(
  $: EngineInterface,
  turnId: string,
  text: string,
  cfg: Config,
): Promise<Route | null> {
  // Un turno sin prompt escrito (continuación) o un comando no se enrutan.
  if (text.trim() === '' || text.trimStart().startsWith('/')) return null

  const verdict = classify(text, RULES)
  const turns = await countTurns($)
  const isStandard = verdict.tier === RULES.default_tier && !verdict.isForced
  const isLong = turns !== null && turns > cfg.maxTurnsToDownshift
  // Bajar de modelo en una conversación larga sale caro: hay que volver a pagar
  // todo el contexto en el modelo nuevo. Si no se puede medir, se asume larga.
  const isBlocked = verdict.tier === 'haiku' && !verdict.isForced && (turns === null || isLong)
  // "Estándar" es Sonnet de forma explícita. Dejar "el modelo de la sesión" no
  // es estable: al reanudar una sesión, el proceso arranca con el modelo del
  // último turno, que puede haber sido Haiku u Opus por obra de este mod.
  const standard = cfg.standardModel === 'sonnet' ? 'sonnet' : null
  const model = isStandard || isBlocked ? standard : verdict.tier

  return {
    turnId,
    model,
    isForced: verdict.isForced,
    reason: isBlocked ? 'conversación larga, no baja a Haiku' : verdict.reason,
    turns,
    isLong,
    isBlocked,
  }
}

// Modelo que debe llevar este paso, o undefined para dejar el de la sesión.
// Falla abierto: ante cualquier error el turno sigue como si el mod no estuviera.
async function modelFor($: EngineInterface, e: Step, cfg: Config): Promise<Tier | undefined> {
  try {
    const { value } = await $.state.get(ROUTE)
    const route = value != null && value.turnId === e.turnId ? value : null
    const model = route?.model ?? undefined

    if (e.index === 0) {
      await track($, cfg.showMeter, {
        model: model ?? e.model,
        isRouted: model !== undefined && tierOf(e.model) !== model,
        note: route?.isBlocked ? 'conversación larga, no baja a Haiku' : null,
        turns: route?.turns ?? null,
      })

      if (route !== null && model !== undefined && tierOf(e.model) !== model) {
        // Subir a Opus en una conversación larga con la caché de Opus fría sale
        // caro: el primer turno paga de nuevo todo el contexto. No se sabe si está
        // fría, así que se avisa con condicional y no se bloquea.
        const warning =
          model === 'opus' && !route.isForced && route.isLong
            ? ' Conversación larga: si la caché de Opus ya caducó, este turno paga de nuevo todo el contexto.'
            : ''

        notify($, `Router → ${model} (${route.reason}).${warning}`)
      }
    }

    return model
  } catch {
    return undefined
  }
}

async function record(
  $: EngineInterface,
  e: { turnId: string; usage: { model: string; input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } },
): Promise<void> {
  try {
    const { value } = await $.state.get(ROUTE)
    const log = ((await $.store.get(LOG_KEY)) ?? []) as TurnRecord[]
    const row: TurnRecord = {
      at: await $.clock.now(),
      tier: value?.turnId === e.turnId ? (value.model ?? 'sonnet') : 'sonnet',
      model: e.usage.model,
      input: e.usage.input_tokens,
      output: e.usage.output_tokens,
      cacheRead: e.usage.cache_read_input_tokens ?? 0,
      cacheWrite: e.usage.cache_creation_input_tokens ?? 0,
    }
    await $.store.set(LOG_KEY, [...log, row].slice(-LOG_LIMIT))
  } catch {
    // medir es opcional
  }
}

function summary(log: TurnRecord[]): string {
  if (log.length === 0) return 'Todavía no hay turnos registrados.'

  const byTier = new Map<Tier, { turns: number; tokens: number }>()
  for (const r of log) {
    const row = byTier.get(r.tier) ?? { turns: 0, tokens: 0 }
    row.turns += 1
    row.tokens += r.input + r.output + r.cacheRead + r.cacheWrite
    byTier.set(r.tier, row)
  }

  const lines = [...byTier].map(
    ([tier, row]) => `${tier}: ${row.turns} turnos, ${row.tokens} tokens`,
  )

  return [`Últimos ${log.length} turnos:`, ...lines].join('\n')
}

export const register: Register = (on, options) => {
  const cfg: Config = {
    maxTurnsToDownshift: Number(options.maxTurnsToDownshift ?? 6),
    standardModel: options.standardModel === 'session' ? 'session' : 'sonnet',
    showMeter: options.showMeter !== false,
  }

  // Decide una vez, al empezar el turno principal, y deja la decisión en el
  // estado de la sesión. Cada paso del turno la lee, así el modelo no cambia a
  // mitad de turno y no se invalida la caché del prompt.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      try {
        await $.state.set(ROUTE, await decide($, e.turnId, e.text, cfg))
      } catch {
        // sin decisión: los pasos no tocan nada
      }
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const model = e.agentId === undefined ? await modelFor($, e, cfg) : undefined

    if (model === undefined) return yield* next(e)

    return yield* next({ ...e, model })
  })

  // Registra los tokens reales de cada turno para poder medir el ahorro.
  on('turn.complete', async ($, e, next) => {
    const answer = await next(e)

    if (e.agentId === undefined && e.usage !== undefined) {
      await record($, { turnId: e.turnId, usage: e.usage })
      // Gastado = lo que cuesta de verdad: entrada nueva, escritura de caché y
      // salida. La lectura de caché se repite en cada turno y no se suma.
      const { input_tokens, output_tokens, cache_creation_input_tokens = 0 } = e.usage
      await track($, cfg.showMeter, { model: e.usage.model }, { spent: input_tokens + cache_creation_input_tokens + output_tokens })
    }

    return answer
  })

  // El motor avisa tras cada turno principal y cuando un límite sube un punto.
  on('session.measure', async ($, e, next) => {
    await track($, cfg.showMeter, {}, { usage: e })

    return next(e)
  })

  registerBand(on, cfg.showMeter)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'router-stats',
      description: 'Tokens por nivel de los últimos turnos del router',
    })

    return next(e)
  })

  on('command.run', { command: 'router-stats' }, async $ => ({
    text: summary(((await $.store.get(LOG_KEY)) ?? []) as TurnRecord[]),
  }))
}
