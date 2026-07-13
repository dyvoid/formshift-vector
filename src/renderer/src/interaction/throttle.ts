// Per-control streaming behavior, per the design doc's Preview interaction
// section: every control that streams intermediate values gets an adjustable
// throttle rate and a commit-only option. This module owns "how often the
// server gets asked"; how expensively it computes (draft) is a separate axis.

export interface ControlStreamOptions {
  /** Minimum milliseconds between streamed sends. 0 streams every input. */
  rateMs: number
  /** When true, intermediate values are dropped entirely; only commit() sends. */
  commitOnly: boolean
}

export interface ControlStream<T> {
  /** An intermediate value during one interaction (drag, held stepper). */
  input(value: T): void
  /** The final value of the interaction (mouse-up, enter). Always sends. */
  commit(value: T): void
  /** Cancel any pending trailing send. */
  dispose(): void
}

/**
 * Trailing-edge throttle: an input inside the rate window is deferred (and
 * superseded by later inputs) so the last dragged value is never lost, at
 * most one timer deep. commit() flushes immediately and resets the window.
 */
export function createControlStream<T>(
  send: (value: T) => void,
  options: ControlStreamOptions
): ControlStream<T> {
  let lastSent = Number.NEGATIVE_INFINITY
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: { value: T } | undefined

  function sendNow(value: T): void {
    lastSent = Date.now()
    send(value)
  }

  function clearPending(): void {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    pending = undefined
  }

  return {
    input(value: T): void {
      if (options.commitOnly) return
      const elapsed = Date.now() - lastSent
      if (elapsed >= options.rateMs) {
        clearPending()
        sendNow(value)
        return
      }
      pending = { value }
      if (timer === undefined) {
        timer = setTimeout(() => {
          timer = undefined
          if (pending !== undefined) {
            const { value: v } = pending
            pending = undefined
            sendNow(v)
          }
        }, options.rateMs - elapsed)
      }
    },

    commit(value: T): void {
      clearPending()
      sendNow(value)
    },

    dispose(): void {
      clearPending()
    }
  }
}
