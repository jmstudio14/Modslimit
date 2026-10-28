#!/usr/bin/env node
// Prueba en vivo del mod: lanza `claude -p` desde una carpeta vacía y comprueba
// a qué modelo va la petición principal de cada prompt y qué anuncia el mod en
// la barra de estado.
//
//   node tests/live/smoke.mjs                           # usa el mod instalado
//   node tests/live/smoke.mjs --plugin-dir mods/modslimit-router
//   node tests/live/smoke.mjs --only simple             # un solo caso
//
// No entra en CI: necesita el binario de Claude Code con credenciales y gasta
// cuota (unos 0,2 $ según la propia CLI, sobre todo el caso de Opus).
import { spawnSync } from 'node:child_process'
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
  console.log('uso: node tests/live/smoke.mjs [--plugin-dir <carpeta del mod>] [--only simple|estándar|opus]')
  process.exit(0)
}

const CLAUDE = process.env.CLAUDE_BIN ?? 'claude'
const pluginArgs = values['plugin-dir'] ? ['--plugin-dir', resolve(values['plugin-dir'])] : []

// `model: 'session'` = el modelo con el que arranca la sesión, tal como lo
// informa el evento init; el mod no debe tocarlo ni anunciar nada.
const CASES = [
  { name: 'simple', prompt: 'Renombra la variable x a total en: x = 1', model: 'haiku', status: /^router: haiku · turno 1$/ },
  { name: 'estándar', prompt: 'Explica en una frase qué es una variable', model: 'session', status: null },
  { name: 'opus', prompt: '!opus responde solo OK', model: 'opus', status: /^router: opus · turno 1$/ },
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

// La petición principal es la que más tokens de entrada lleva: el prompt fijo
// de Claude Code pesa decenas de miles, mientras que las llamadas internas de
// Haiku (títulos, resúmenes) rondan el millar.
function mainModel(modelUsage) {
  const size = u => (u.inputTokens ?? 0) + (u.cacheReadInputTokens ?? 0) + (u.cacheCreationInputTokens ?? 0)
  const [model] = Object.entries(modelUsage).sort((a, b) => size(b[1]) - size(a[1]))[0] ?? []

  return model
}

function run(prompt, cwd) {
  const res = spawnSync(CLAUDE, ['-p', prompt, '--output-format', 'stream-json', '--verbose', ...pluginArgs], {
    cwd,
    input: '',
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 64 * 1024 * 1024,
  })
  const events = parse(res.stdout ?? '')

  return {
    status: res.status,
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
    const r = run(c.prompt, dir)
    const problems = []

    if (r.error || !r.result) {
      problems.push(`la ejecución falló: ${r.error ?? 'sin resultado'}`)
    } else {
      cost += r.result.total_cost_usd ?? 0
      const model = mainModel(r.result.modelUsage ?? {}) ?? ''
      const expected = c.model === 'session' ? (r.init?.model ?? '') : c.model

      if (!model.includes(expected)) problems.push(`modelo ${model || '?'}, se esperaba ${expected}`)
      if (c.status ? !r.bar.some(t => c.status.test(t)) : r.bar.length > 0) {
        problems.push(`barra de estado ${JSON.stringify(r.bar)}, se esperaba ${c.status ?? 'nada'}`)
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
