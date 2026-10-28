import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const DONE = {
  answer: '',
  toolUses: [],
  stopReason: 'end_turn',
  usage: null,
} as const

// Lo que el motor añade a una orden escrita por la persona.
const TYPED = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

const SESSION_MODEL = 'claude-sonnet-5-5'

type Step = { index?: number; messageCount?: number; agentId?: string }

// Lo que hace el motor por debajo del mod: recibe la petición y deja anotado
// el modelo con el que llegó. `turns` son los prompts que la persona lleva
// enviados; sin él, la llamada no tiene respuesta, como si la medida fallara.
function engine(on: On, turns?: number) {
  const seen: string[] = []
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  if (turns !== undefined) on('session.turns', () => ({ value: turns }))
  on('turn.step', async function* (_, e) {
    seen.push(e.model)

    return { ...DONE, turnId: e.turnId, index: e.index }
  })

  return seen
}

async function step($: Engine, turnId: string, s: Step = {}) {
  const stream = $.turn.step({
    turnId,
    index: s.index ?? 0,
    model: SESSION_MODEL,
    // Incluye el contexto que inyecta el motor; no debe influir en la decisión.
    messageCount: s.messageCount ?? 4,
    ...(s.agentId === undefined ? {} : { agentId: s.agentId }),
  })
  for await (const _ of stream) {
    // se vacía la respuesta
  }
  await stream.result
}

async function turn($: Engine, seen: string[], text: string, s: Step = {}) {
  seen.length = 0
  await $.turn.start({ turnId: 't1', text })
  await step($, 't1', s)

  return seen[0]
}

test('una tarea crítica sube a Opus', async ($, on) => {
  const seen = engine(on, 1)

  expect(await turn($, seen, 'Diseña la arquitectura del sistema de pagos')).toBe('opus')
})

test('Opus no depende de lo larga que sea la conversación', async ($, on) => {
  const seen = engine(on, 50)

  expect(await turn($, seen, 'Diseña la arquitectura del sistema de pagos')).toBe('opus')
})

test('una tarea simple baja a Haiku en una conversación corta', async ($, on) => {
  const seen = engine(on, 1)

  expect(await turn($, seen, 'Renombra la variable x a total')).toBe('haiku')
})

test('REGRESIÓN: el contexto que inyecta el motor no impide bajar a Haiku', async ($, on) => {
  // Una sesión recién abierta con CLAUDE.md, hooks y avisos ya lleva muchos
  // mensajes en la petición. Antes eso bloqueaba el cambio.
  const seen = engine(on, 1)

  expect(
    await turn($, seen, 'Renombra la variable x a total', { messageCount: 500 }),
  ).toBe('haiku')
})

test('en una conversación larga no se baja a Haiku', async ($, on) => {
  const seen = engine(on, 20)

  expect(await turn($, seen, 'Renombra la variable x a total')).toBe(SESSION_MODEL)
})

test('con 6 prompts, el umbral, todavía baja a Haiku', async ($, on) => {
  const seen = engine(on, 6)

  expect(await turn($, seen, 'Renombra la variable x a total')).toBe('haiku')
})

test('con 7 prompts ya no baja a Haiku', async ($, on) => {
  const seen = engine(on, 7)

  expect(await turn($, seen, 'Renombra la variable x a total')).toBe(SESSION_MODEL)
})

test('si no se puede medir la conversación, no se baja', async ($, on) => {
  const seen = engine(on)

  expect(await turn($, seen, 'Renombra la variable x a total')).toBe(SESSION_MODEL)
})

test('!haiku fuerza Haiku aunque la conversación sea larga', async ($, on) => {
  const seen = engine(on, 20)

  expect(await turn($, seen, '!haiku explica esto')).toBe('haiku')
})

test('una tarea estándar no toca el modelo de la sesión', async ($, on) => {
  const seen = engine(on, 1)

  expect(await turn($, seen, 'Implementa una función que valide emails')).toBe(SESSION_MODEL)
})

test('un comando no se enruta', async ($, on) => {
  const seen = engine(on, 1)

  expect(await turn($, seen, '/help arquitectura')).toBe(SESSION_MODEL)
})

test('el modelo elegido vale para todo el turno', async ($, on) => {
  const seen = engine(on, 1)

  await $.turn.start({ turnId: 't1', text: 'Renombra la variable x a total' })
  await step($, 't1', { index: 0, messageCount: 4 })
  // El contexto crece con los resultados de herramientas: el turno no cambia.
  await step($, 't1', { index: 1, messageCount: 60 })

  expect(seen).toEqual(['haiku', 'haiku'])
})

test('un subagente no se enruta', async ($, on) => {
  const seen = engine(on, 1)

  expect(
    await turn($, seen, 'Diseña la arquitectura del sistema', { agentId: 'a1' }),
  ).toBe(SESSION_MODEL)
})

test('la decisión de un turno no pasa al siguiente', async ($, on) => {
  const seen = engine(on, 1)

  await $.turn.start({ turnId: 't1', text: 'Diseña la arquitectura del sistema' })
  await step($, 't2')

  expect(seen).toEqual([SESSION_MODEL])
})

test('un estado inesperado no rompe el turno', async ($, on) => {
  const seen = engine(on, 1)
  on('state.get', () => ({ value: { value: 'basura', version: 1 } }))

  await $.turn.start({ turnId: 't1', text: 'Diseña la arquitectura del sistema' })
  await step($, 't1')

  expect(seen).toEqual([SESSION_MODEL])
})

test('/router-stats suma los tokens por nivel', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'router-stats' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('session.turns', () => ({ value: 1 }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run({ command: 'router-stats', args: '', ...TYPED })).text).toBe(
    'Todavía no hay turnos registrados.',
  )

  await $.turn.start({ turnId: 't1', text: 'Renombra la variable x a total' })
  await $.turn.complete({
    turnId: 't1',
    answer: 'hecho',
    durationMs: 10,
    isAborted: false,
    reason: 'answer',
    usage: {
      model: 'claude-haiku-5-5',
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 5,
      cache_creation_input_tokens: 0,
    },
  })

  const { text } = await $.command.run({ command: 'router-stats', args: '', ...TYPED })
  expect(text).toContain('1 turnos')
  expect(text).toContain('haiku: 1 turnos, 125 tokens')
})
