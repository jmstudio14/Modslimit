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

// Una ventana de límite de la suscripción tal como la informa el motor.
export type Limit = {
  // five_hour, seven_day o, en una pasarela, spend_limit.
  kind: string
  // 0 a 100.
  percentUsed: number
  // ISO 8601.
  resetsAt?: string
}

// Lo que la barra de uso muestra. Todo lo que no se conoce es null o vacío.
export type Meter = {
  // Modelo con el que va la petición, o el que informó la API al terminar.
  model: string | null
  // El router cambió el modelo respecto al que traía la petición.
  isRouted: boolean
  // Aviso corto del router, p. ej. por qué no baja a Haiku.
  note: string | null
  turns: number | null
  contextTokens: number | null
  contextWindow: number | null
  contextPercent: number | null
  limits: Limit[]
  costUsd: number | null
  // Tokens nuevos desde que se cargó el mod: entrada nueva + escritura de
  // caché + salida. No cuenta las lecturas de caché, que se repiten cada turno.
  spent: number
}

declare module 'claude-code' {
  interface PluginState {
    'modslimit-router': { route: Route | null; meter: Meter | null }
  }
}
