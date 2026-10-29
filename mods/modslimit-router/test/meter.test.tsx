import type { On, SessionUsage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'modslimit-router',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

const USAGE: SessionUsage = {
  startedAt: 0,
  context: { tokens: 95_397, window: 1_000_000, percent: 9 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 23.5, resetsAt: '2030-01-01T00:00:00Z' }],
  cost: { usd: 0.35 },
}

// Lo que hace el motor por debajo del mod. `statuses` recoge la línea de estado.
function engine(on: On, usage: SessionUsage | null = USAGE) {
  const statuses: string[] = []
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('session.turns', () => ({ value: 1 }))
  on('ui.status', (_, e) => {
    statuses.push(e.text ?? '')

    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('turn.step', async function* (_, e) {
    return { answer: '', toolUses: [], stopReason: 'end_turn', usage: null, turnId: e.turnId, index: e.index }
  })
  on('session.usage', () => {
    if (usage === null) return { deny: 'sin medida' }

    return { value: usage }
  })

  return { statuses }
}

async function haikuTurn($: Engine, turnId = 't1') {
  await $.turn.start({ turnId, text: 'Renombra la variable x a total' })
  const stream = $.turn.step({ turnId, index: 0, model: 'claude-sonnet-5-5', messageCount: 4 })
  for await (const _ of stream) {
    // se vacía la respuesta
  }
  await stream.result
}

const COMPLETE = {
  turnId: 't1',
  answer: 'hecho',
  durationMs: 10,
  isAborted: false,
  reason: 'answer',
  usage: {
    model: 'claude-haiku-5-5',
    input_tokens: 100,
    output_tokens: 20,
    cache_read_input_tokens: 5_000,
    cache_creation_input_tokens: 300,
  },
} as const

test('la línea de estado lleva el modelo, el contexto, los límites y el coste', async ($, on) => {
  mock.store(on)
  const { statuses } = engine(on)

  await haikuTurn($)

  expect(statuses.at(-1)).toBe('Haiku (router) · ctx 95,4k/1M 9 % · 5 h 23,5 % · 0,35 $')
})

test('al terminar el turno suma tokens nuevos sin contar la lectura de caché', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const { statuses } = engine(on)
  on('turn.complete', () => ({ text: '' }))

  await haikuTurn($)
  await $.turn.complete(COMPLETE)

  // 100 de entrada + 300 de escritura de caché + 20 de salida; las 5.000 de lectura no.
  expect(statuses.at(-1)).toContain('420 tok')
})

test('el gasto se acumula de un turno al siguiente', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const { statuses } = engine(on)
  on('turn.complete', () => ({ text: '' }))

  await haikuTurn($)
  await $.turn.complete(COMPLETE)
  await haikuTurn($, 't2')
  await $.turn.complete({ ...COMPLETE, turnId: 't2' })

  expect(statuses.at(-1)).toContain('840 tok')
})

test('si el motor no mide el uso, se muestra el modelo y no se rompe el turno', async ($, on) => {
  mock.store(on)
  const { statuses } = engine(on, null)

  await haikuTurn($)

  expect(statuses.at(-1)).toBe('Haiku (router)')
})

test('session.measure refresca contexto, límites y coste', async ($, on) => {
  mock.store(on)
  const { statuses } = engine(on)
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await haikuTurn($)
  await $.session.measure({
    context: { tokens: 200_000, window: 1_000_000, percent: 20 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 81 }],
    cost: { usd: 1.5 },
    changed: ['context', 'rateLimits', 'cost'],
  })

  expect(statuses.at(-1)).toBe('Haiku (router) · ctx 200k/1M 20 % · 5 h 81 % · 1,50 $')
})

test('la banda se dibuja en escritorio con modelo, contexto y gasto', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  engine(on)
  on('turn.complete', () => ({ text: '' }))

  await haikuTurn($)
  await $.turn.complete(COMPLETE)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const texts: string[] = []
  for (const text of [/Haiku/, /contexto 95,4k/, /5 h: 23,5 %/, /gastado 420 tokens/]) {
    texts.push((await ui.find({ type: 'Text', text }))?.text ?? `falta ${text}`)
  }

  expect(texts.join('|')).not.toContain('falta')
  await ui.unmount()
})

test('en el terminal la banda cede al motor: la barra de abajo ya lo cubre', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  engine(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await haikuTurn($)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('con una encuesta abierta la banda cede el sitio', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  engine(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await haikuTurn($)

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('con showMeter=false no hay banda ni línea de estado', { options: { showMeter: false } }, async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const { statuses } = engine(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await haikuTurn($)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  expect(statuses).toEqual([])
  await ui.unmount()
})

test('antes del primer turno no hay nada que enseñar', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  engine(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
