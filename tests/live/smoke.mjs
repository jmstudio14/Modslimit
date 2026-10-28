#!/usr/bin/env node
// Prueba en vivo del mod: lanza `claude -p` desde una carpeta vacía y comprueba
// a qué modelo va la petición principal de cada turno y qué anuncia el mod en
// la barra de estado.
//
//   node tests/live/smoke.mjs                           # usa el mod instalado
//   node tests/live/smoke.mjs --plugin-dir mods/modslimit-router
//   node tests/live/smoke.mjs --only reanudar           # un solo caso
//
// No entra en CI: necesita el binario de Claude Code con credenciales y gasta
// cuota (unos 0,3 $ según la propia CLI, sobre todo el caso de Opus). Con
// --plugin-dir, el mod no debe estar instalado a la vez.
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    'plugin-dir': { type: 'string' },
    only: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log('uso: node tests/live/smoke.mjs [--plugin-dir <carpeta del mod>] [--only simple|estándar|opus|reanudar]')
  process.exit(0)
}

const CLAUDE = process.env.CLAUDE_BIN ?? 'claude'
const pluginArgs = values['plugin-dir'] ? ['--plugin-dir', resolve(values['plugin-dir'])] : []

// Cada caso es una conversación; sus turnos comparten sesión. `model` es el
// modelo esperado de la petición principal y `bar` lo que debe anunciar el mod.
const CASES = [
  {
    name: 'simple',
    turns: [{ prompt: 'Renombra la variable x a total en: x = 1', model: 'haiku', bar: /^router: haiku · turno 1$/ }],
  },
  {
    name: 'estándar',
    turns: [{ prompt: 'Explica en una frase qué es una variable', model: 'sonnet', bar: /^router: sonnet · turno 1$/ }],
  },
  {
    name: 'opus',
    turns: [{ prompt: '!opus responde solo OK', model: 'opus', bar: /^router: opus · turno 1$/ }],
  },
  {
    // Al reanudar una sesión, el proceso arranca con el modelo del turno
    // anterior. Un prompt estándar debe volver a Sonnet igualmente.
    name: 'reanudar',
    turns: [
      { prompt: '!haiku responde solo OK', model: 'haiku', bar: /^router: haiku · turno 1$/ },
      { prompt: 'Explica en una frase qué es una variable', model: 'sonnet', bar: /^router: sonnet · turno 2$/ },
    ],
  },
]

const parse = text =>
  text
    .split('\n')
    .filter(l => l.startsWith('{'))
    .map(l => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)

const FIELDS = ['inputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens']
const tokens = u => FIELDS.reduce((sum, f) => sum + (u[f] ?? 0), 0)

// En una sesión reanudada el uso es acumulado: lo de este turno es la diferencia.
function usageSince(previous, current) {
  const out = {}

  for (const [model, u] of Object.entries(current)) {
    const used = tokens(u) - tokens(previous[model] ?? {})
    if (used > 0) out[model] = used
  }

  return out
}

// La petición principal es la que más tokens de entrada lleva: el prompt fijo
// de Claude Code pesa decenas de miles, mientras que las llamadas internas de
// Haiku (títulos, resúmenes) rondan el millar.
const mainModel = used => Object.entries(used).sort((a, b) => b[1] - a[1])[0]?.[0]

function run(prompt, cwd, sessionArgs) {
  const res = spawnSync(
    CLAUDE,
    ['-p', prompt, ...sessionArgs, '--output-format', 'stream-json', '--verbose', ...pluginArgs],
    { cwd, input: '', encoding: 'utf8', timeout: 180_000, maxBuffer: 64 * 1024 * 1024 },
  )
  const events = parse(res.stdout ?? '')

  return {
    error: res.error?.message ?? (res.status === 0 ? null : (res.stderr ?? '').slice(0, 200)),
    init: events.find(e => e.type === 'system' && e.subtype === 'init'),
    result: events.findLast(e => e.type === 'result'),
    bar: events.filter(e => e.subtype === 'ui_status' && e.plugin === 'modslimit-router').map(e => e.text),
  }
}

const dir = mkdtempSync(join(tmpdir(), 'modslimit-smoke-'))
let failed = 0
let cost = 0

try {
  for (const c of CASES.filter(c => !values.only || c.name === values.only)) {
    // Id propio: las ejecuciones anidadas heredan el de la sesión que las
    // lanza, y reanudar ese reanudaría otra conversación.
    const id = randomUUID()
    const problems = []
    let previous = {}
    let previousCost = 0

    for (const [i, t] of c.turns.entries()) {
      const r = run(t.prompt, dir, i === 0 ? ['--session-id', id] : ['--resume', id])
      const label = c.turns.length > 1 ? `turno ${i + 1}: ` : ''

      if (r.error || !r.result) {
        problems.push(`${label}la ejecución falló: ${r.error ?? 'sin resultado'}`)
        break
      }
      if (r.init?.session_id !== id) {
        problems.push(`${label}la sesión usó el id ${r.init?.session_id}, no el propio: se detiene`)
        break
      }

      const current = r.result.modelUsage ?? {}
      const model = mainModel(usageSince(previous, current)) ?? ''
      cost += (r.result.total_cost_usd ?? 0) - previousCost
      previous = current
      previousCost = r.result.total_cost_usd ?? 0

      if (!model.includes(t.model)) problems.push(`${label}modelo ${model || '?'}, se esperaba ${t.model}`)
      if (!r.bar.some(text => t.bar.test(text))) {
        problems.push(`${label}barra de estado ${JSON.stringify(r.bar)}, se esperaba ${t.bar}`)
      }
    }

    failed += problems.length > 0 ? 1 : 0
    console.log(`${problems.length ? '✗' : '✓'} ${c.name.padEnd(9)} ${problems.join('; ')}`)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(`\n${failed ? `${failed} caso(s) fallaron` : 'todo correcto'} · coste según la CLI: ${cost.toFixed(3)} $`)
process.exit(failed ? 1 : 0)
