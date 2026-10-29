// Formato de la barra de uso (funciones puras, sin motor).
// Node 22.18+ ejecuta .ts sin flags: node --test tests/test_meter.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildBand,
  buildStatus,
  formatDuration,
  formatPercent,
  formatReset,
  formatTokens,
  formatUsd,
  limitLabel,
  modelName,
  severity,
} from '../mods/modslimit-router/hooks/meter.ts'

const NOW = Date.parse('2026-10-29T10:00:00Z')

const METER = {
  model: 'claude-haiku-5-5',
  isRouted: true,
  note: null,
  turns: 3,
  contextTokens: 95397,
  contextWindow: 1_000_000,
  contextPercent: 9,
  limits: [
    { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-29T12:10:00Z' },
    { kind: 'seven_day', percentUsed: 41 },
  ],
  costUsd: 0.35,
  spent: 12345,
}

test('formatTokens: miles con coma decimal y millones', () => {
  const cases = [
    [0, '0'],
    [950, '950'],
    [999, '999'],
    [1000, '1k'],
    [1234, '1,2k'],
    [12345, '12,3k'],
    [95397, '95,4k'],
    [100_000, '100k'],
    [540_000, '540k'],
    [999_999, '1M'],
    [1_000_000, '1M'],
    [1_500_000, '1,5M'],
    [2_000_000, '2M'],
  ]

  for (const [n, expected] of cases) assert.equal(formatTokens(n), expected, String(n))
})

test('formatTokens: lo que no es un número válido es 0', () => {
  assert.equal(formatTokens(Number.NaN), '0')
  assert.equal(formatTokens(-5), '0')
})

test('formatPercent: hasta un decimal, sin ceros sobrantes', () => {
  assert.equal(formatPercent(9), '9 %')
  assert.equal(formatPercent(23.5), '23,5 %')
  assert.equal(formatPercent(7), '7 %')
  assert.equal(formatPercent(0), '0 %')
  assert.equal(formatPercent(100), '100 %')
  assert.equal(formatPercent(23.456), '23,5 %')
})

test('formatDuration: de días a minutos', () => {
  const MIN = 60_000
  assert.equal(formatDuration(0), 'ya')
  assert.equal(formatDuration(-5), 'ya')
  assert.equal(formatDuration(30_000), '<1 min')
  assert.equal(formatDuration(45 * MIN), '45 min')
  assert.equal(formatDuration(130 * MIN), '2 h 10 min')
  assert.equal(formatDuration(120 * MIN), '2 h')
  assert.equal(formatDuration(26 * 60 * MIN), '1 d 2 h')
  assert.equal(formatDuration(3 * 24 * 60 * MIN), '3 d')
})

test('formatReset: tiempo hasta el reinicio, o nada si no se puede decir', () => {
  assert.equal(formatReset('2026-10-29T12:10:00Z', NOW), 'reinicia en 2 h 10 min')
  assert.equal(formatReset(undefined, NOW), null)
  assert.equal(formatReset('no es una fecha', NOW), null)
  assert.equal(formatReset('2026-10-29T09:00:00Z', NOW), null)
})

test('formatUsd', () => {
  assert.equal(formatUsd(0.35), '0,35 $')
  assert.equal(formatUsd(0), '0,00 $')
  assert.equal(formatUsd(0.004), '<0,01 $')
  assert.equal(formatUsd(12.345), '12,35 $')
  assert.equal(formatUsd(1234.5), '1234,50 $')
})

test('modelName y limitLabel', () => {
  assert.equal(modelName('claude-haiku-5-5'), 'Haiku')
  assert.equal(modelName('claude-sonnet-5-5'), 'Sonnet')
  assert.equal(modelName('opus'), 'Opus')
  assert.equal(modelName('claude-fable-5-1'), 'fable-5-1')
  assert.equal(modelName(null), '')
  assert.equal(limitLabel('five_hour'), '5 h')
  assert.equal(limitLabel('seven_day'), '7 d')
  assert.equal(limitLabel('spend_limit'), 'gasto')
  assert.equal(limitLabel('otro'), 'otro')
})

test('severity: aviso desde el 80 % y alerta desde el 95 %', () => {
  assert.equal(severity(0), 'ok')
  assert.equal(severity(79.9), 'ok')
  assert.equal(severity(80), 'warn')
  assert.equal(severity(94.9), 'warn')
  assert.equal(severity(95), 'alert')
  assert.equal(severity(120), 'alert')
})

test('buildStatus: línea compacta con todo', () => {
  assert.equal(
    buildStatus(METER, NOW),
    'Haiku (router) · ctx 95,4k/1M 9 % · 5 h 23,5 % · 7 d 41 % · 12,3k tok · 0,35 $',
  )
})

test('buildStatus: omite lo que no se conoce', () => {
  const bare = { ...METER, limits: [], contextTokens: null, contextWindow: null, contextPercent: null, costUsd: null, spent: 0 }

  assert.equal(buildStatus(bare, NOW), 'Haiku (router)')
  assert.equal(buildStatus({ ...bare, isRouted: false, model: 'claude-sonnet-5-5' }, NOW), 'Sonnet')
  assert.equal(buildStatus({ ...bare, model: null }, NOW), '')
})

test('buildStatus: la nota del freno va justo después del modelo', () => {
  const text = buildStatus({ ...METER, model: 'claude-sonnet-5-5', note: 'conversación larga, no baja a Haiku' }, NOW)

  assert.ok(text.startsWith('Sonnet (router) · conversación larga, no baja a Haiku · ctx '), text)
})

test('buildStatus: sin tokens nuevos pero con coste sigue mostrando el coste', () => {
  const text = buildStatus({ ...METER, spent: 0 }, NOW)

  assert.ok(text.endsWith('· 0,35 $'), text)
  assert.ok(!text.includes('tok'), text)
})

test('buildBand: segmentos con su gravedad', () => {
  assert.deepEqual(buildBand(METER, NOW), [
    { text: 'Haiku (router)', severity: 'ok', strong: true },
    { text: 'contexto 95,4k / 1M (9 %)', severity: 'ok' },
    { text: '5 h: 23,5 % · reinicia en 2 h 10 min', severity: 'ok' },
    { text: '7 d: 41 %', severity: 'ok' },
    { text: 'gastado 12,3k tokens · 0,35 $', severity: 'ok' },
  ])
})

test('buildBand: un límite casi agotado sube de gravedad', () => {
  const band = buildBand({ ...METER, limits: [{ kind: 'five_hour', percentUsed: 96 }], contextPercent: 85 }, NOW)

  assert.equal(band.find(s => s.text.startsWith('5 h'))?.severity, 'alert')
  assert.equal(band.find(s => s.text.startsWith('contexto'))?.severity, 'warn')
})

test('buildBand: sin coste solo muestra los tokens', () => {
  const band = buildBand({ ...METER, costUsd: null }, NOW)

  assert.equal(band.at(-1)?.text, 'gastado 12,3k tokens')
})

test('buildBand: sin modelo no hay banda', () => {
  assert.deepEqual(buildBand({ ...METER, model: null }, NOW), [])
})
