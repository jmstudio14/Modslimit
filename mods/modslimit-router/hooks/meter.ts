// Formato de la barra de uso: funciones puras, sin `$`, que prueba
// tests/test_meter.mjs sin necesidad del motor.
import type { Limit, Meter } from '../types'

export type Severity = 'ok' | 'warn' | 'alert'

export type Segment = { text: string; severity: Severity; strong?: true }

// Coma decimal y sin ceros sobrantes: "12.0" → "12", "12.3" → "12,3".
const trim = (s: string) => s.replace('.', ',').replace(/,0$/, '')

export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n < 1000) return String(Math.round(n))
  if (n < 100_000) return `${trim((n / 1000).toFixed(1))}k`
  if (n < 999_500) return `${Math.round(n / 1000)}k`

  return `${trim((n / 1_000_000).toFixed(1))}M`
}

export function formatPercent(p: number): string {
  return `${trim((Number.isFinite(p) ? p : 0).toFixed(1))} %`
}

export function formatDuration(ms: number): string {
  if (!(ms > 0)) return 'ya'

  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return '<1 min'

  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60

  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`
  if (hours > 0) return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`

  return `${rest} min`
}

// null si no se puede decir cuándo (sin fecha, fecha inválida o ya pasada).
export function formatReset(resetsAt: string | undefined, now: number): string | null {
  if (resetsAt === undefined) return null

  const at = Date.parse(resetsAt)
  if (Number.isNaN(at) || at <= now) return null

  return `reinicia en ${formatDuration(at - now)}`
}

export function formatUsd(n: number): string {
  if (n > 0 && n < 0.01) return '<0,01 $'

  return `${n.toFixed(2).replace('.', ',')} $`
}

export function modelName(id: string | null): string {
  if (!id) return ''
  if (id.includes('haiku')) return 'Haiku'
  if (id.includes('sonnet')) return 'Sonnet'
  if (id.includes('opus')) return 'Opus'

  return id.replace(/^claude-/, '')
}

export function limitLabel(kind: string): string {
  if (kind === 'five_hour') return '5 h'
  if (kind === 'seven_day') return '7 d'
  if (kind === 'spend_limit') return 'gasto'

  return kind
}

// Aviso desde el 80 % y alerta desde el 95 %.
export function severity(percent: number): Severity {
  if (percent >= 95) return 'alert'
  if (percent >= 80) return 'warn'

  return 'ok'
}

const modelLabel = (m: Meter) => (m.isRouted ? `${modelName(m.model)} (router)` : modelName(m.model))

// Lo que se ha gastado: tokens nuevos y coste, lo que se conozca de los dos.
function spentParts(m: Meter, tokensSuffix: string): string[] {
  const parts: string[] = []

  if (m.spent > 0) parts.push(`${formatTokens(m.spent)}${tokensSuffix}`)
  if (m.costUsd !== null) parts.push(formatUsd(m.costUsd))

  return parts
}

// Línea compacta para la barra de estado de abajo. '' si aún no hay modelo.
export function buildStatus(m: Meter, _now: number): string {
  if (!modelName(m.model)) return ''

  const parts = [modelLabel(m)]

  if (m.note) parts.push(m.note)
  if (m.contextTokens !== null && m.contextWindow) {
    const percent = m.contextPercent === null ? '' : ` ${formatPercent(m.contextPercent)}`
    parts.push(`ctx ${formatTokens(m.contextTokens)}/${formatTokens(m.contextWindow)}${percent}`)
  }
  for (const limit of m.limits) parts.push(`${limitLabel(limit.kind)} ${formatPercent(limit.percentUsed)}`)

  const spent = spentParts(m, ' tok')
  if (spent.length > 0) parts.push(spent.join(' · '))

  return parts.join(' · ')
}

const limitSegment = (limit: Limit, now: number): Segment => {
  const reset = formatReset(limit.resetsAt, now)
  const text = `${limitLabel(limit.kind)}: ${formatPercent(limit.percentUsed)}`

  return { text: reset === null ? text : `${text} · ${reset}`, severity: severity(limit.percentUsed) }
}

// Segmentos para la banda de encima del cuadro de texto. [] si aún no hay modelo.
export function buildBand(m: Meter, now: number): Segment[] {
  if (!modelName(m.model)) return []

  const band: Segment[] = [{ text: modelLabel(m), severity: 'ok', strong: true }]

  if (m.note) band.push({ text: m.note, severity: 'ok' })
  if (m.contextTokens !== null && m.contextWindow) {
    const percent = m.contextPercent === null ? '' : ` (${formatPercent(m.contextPercent)})`

    band.push({
      text: `contexto ${formatTokens(m.contextTokens)} / ${formatTokens(m.contextWindow)}${percent}`,
      severity: severity(m.contextPercent ?? 0),
    })
  }
  for (const limit of m.limits) band.push(limitSegment(limit, now))

  const spent = spentParts(m, ' tokens')
  if (spent.length > 0) band.push({ text: `gastado ${spent.join(' · ')}`, severity: 'ok' })

  return band
}
