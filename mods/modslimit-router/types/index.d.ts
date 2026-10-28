export type Route = {
  turnId: string
  // Modelo que se aplica a todo el turno; null deja el que traiga la petición.
  model: 'haiku' | 'sonnet' | 'opus' | null
  isForced: boolean
  reason: string
  // Prompts enviados en la sesión al decidir; null si no se pudo medir.
  turns: number | null
  // Más prompts que `maxTurnsToDownshift`.
  isLong: boolean
  // Una tarea simple que no baja a Haiku por ser la conversación larga.
  isBlocked: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'modslimit-router': { route: Route | null }
  }
}
