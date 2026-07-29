export type UiEvent =
  | { type: 'error' | 'success' | 'info'; content: string }

type Listener = (event: UiEvent) => void

const listeners = new Set<Listener>()

export function emitUiEvent(event: UiEvent) {
  listeners.forEach(listener => listener(event))
}

export function subscribeUiEvents(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
