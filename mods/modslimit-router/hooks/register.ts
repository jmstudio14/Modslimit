import type { EngineInterface, Register } from 'claude-code'

import type { Route } from '../types'
import { classify } from './classify.ts'
import type { Tier } from './classify.ts'
import { RULES } from './rules.ts'

const ROUTE = { plugin: 'modslimit-router', key: 'route' } as const
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

// La barra de estado y el aviso son cosméticos: si fallan no deben anular el
// enrutamiento, por eso van aparte de la lógica que decide.
function announce($: EngineInterface, status: string, toast?: string): void {
  try {
    $.ui.status(status)
    if (toast !== undefined) $.ui.toast(toast)
  } catch {
    // sin avisos
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

// Decide el modelo del turno entero, una sola vez, al empezar.
async function decide(
  $: EngineInterface,
  turnId: string,
  text: string,
  maxTurnsToDownshift: number,
): Promise<Route | null> {
  // Un turno sin prompt escrito (continuación) o un comando no se enrutan.
  if (text.trim() === '' || text.trimStart().startsWith('/')) return null

  const verdict = classify(text, RULES)
  const turns = await countTurns($)
  // El nivel por defecto es "lo que ya usa la sesión": no se toca, salvo que
  // lo fuerce el usuario con !sonnet.
  const isDefault = verdict.tier === RULES.default_tier && !verdict.isForced
  // Bajar de modelo en una conversación larga sale caro: hay que volver a pagar
  // todo el contexto en el modelo nuevo. Si no se puede medir, se asume larga.
  const isTooLong =
    verdict.tier === 'haiku' &&
    !verdict.isForced &&
    (turns === null || turns > maxTurnsToDownshift)

  if (isTooLong) {
    announce($, `router: sin cambio, conversación larga${turns === null ? '' : ` · turno ${turns}`}`)
  }

  return {
    turnId,
    model: isDefault || isTooLong ? null : verdict.tier,
    isForced: verdict.isForced,
    reason: verdict.reason,
    turns,
  }
}

// Modelo que debe llevar este paso, o undefined para dejar el de la sesión.
// Falla abierto: ante cualquier error el turno sigue como si el mod no estuviera.
async function modelFor($: EngineInterface, e: Step): Promise<Tier | undefined> {
  try {
    const { value: route } = await $.state.get(ROUTE)

    if (route == null || route.turnId !== e.turnId || route.model === null) {
      return undefined
    }

    if (e.index === 0) {
      announce(
        $,
        `router: ${route.model}${route.turns === null ? '' : ` · turno ${route.turns}`}`,
        tierOf(e.model) !== route.model ? `Router → ${route.model} (${route.reason})` : undefined,
      )
    }

    return route.model
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
  const maxTurnsToDownshift = Number(options.maxTurnsToDownshift ?? 6)

  // Decide una vez, al empezar el turno principal, y deja la decisión en el
  // estado de la sesión. Cada paso del turno la lee, así el modelo no cambia a
  // mitad de turno y no se invalida la caché del prompt.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      try {
        await $.state.set(ROUTE, await decide($, e.turnId, e.text, maxTurnsToDownshift))
      } catch {
        // sin decisión: los pasos no tocan nada
      }
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const model = e.agentId === undefined ? await modelFor($, e) : undefined

    if (model === undefined) return yield* next(e)

    return yield* next({ ...e, model })
  })

  // Registra los tokens reales de cada turno para poder medir el ahorro.
  on('turn.complete', async ($, e, next) => {
    const answer = await next(e)

    if (e.agentId === undefined && e.usage !== undefined) {
      await record($, { turnId: e.turnId, usage: e.usage })
    }

    return answer
  })

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
