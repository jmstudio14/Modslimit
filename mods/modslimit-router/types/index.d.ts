export type Route = {
  turnId: string
  // Modelo que se aplica a todo el turno; null deja el de la sesión.
  model: 'haiku' | 'sonnet' | 'opus' | null
  isForced: boolean
  reason: string
}

declare module 'claude-code' {
  interface PluginState {
    'modslimit-router': { route: Route | null }
  }
}
