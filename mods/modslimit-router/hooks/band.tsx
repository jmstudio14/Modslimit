import type { On } from 'claude-code'

import { buildBand } from './meter.ts'
import type { Severity } from './meter.ts'

const METER = { plugin: 'modslimit-router', key: 'meter' } as const

const COLOR: Record<Severity, 'warning' | 'error' | undefined> = {
  ok: undefined,
  warn: 'warning',
  alert: 'error',
}

// Banda justo encima del cuadro de texto. En el terminal cede: allí el mismo
// dato va en la línea de estado de abajo del todo.
export function registerBand(on: On, isEnabled: boolean): void {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isEnabled || e.surface === 'terminal' || e.props.hasSurvey) return next(e)

    // Leer aquí suscribe la banda: cada cambio del medidor la redibuja sola.
    const { value: meter } = await $.state.get(METER)
    if (meter == null) return next(e)

    let now = Number.POSITIVE_INFINITY // sin reloj no se dice cuándo reinicia
    try {
      now = await $.clock.now()
    } catch {
      // sin hora de reinicio
    }

    const segments = buildBand(meter, now)
    if (segments.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexWrap="wrap" columnGap="md">
        {segments.map((segment, i) => (
          <Text
            key={String(i)}
            dimColor={segment.severity === 'ok' && segment.strong !== true}
            color={COLOR[segment.severity]}
            weight={segment.strong === true ? 'bold' : undefined}
          >
            {segment.text}
          </Text>
        ))}
      </Box>
    )
  })
}
