// Stale-response discarding, per the design doc's Preview interaction
// section: throttling reduces the frequency of the out-of-order race,
// tracking the latest request per control eliminates it. Superseded requests
// are aborted (so the server can cancel work) and their results — or their
// failures — never reach the caller.

export class LatestGate {
  private readonly seq = new Map<string, number>()
  private readonly controllers = new Map<string, AbortController>()

  /**
   * Run `task` as the latest request for `key`, aborting any in-flight
   * predecessor. Resolves with the task's result, or `undefined` if a newer
   * run superseded this one meanwhile. Errors propagate only from the run
   * that is still the latest; superseded failures (including AbortError) are
   * dropped.
   */
  async run<T>(key: string, task: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    const id = (this.seq.get(key) ?? 0) + 1
    this.seq.set(key, id)

    this.controllers.get(key)?.abort()
    const controller = new AbortController()
    this.controllers.set(key, controller)

    try {
      const result = await task(controller.signal)
      return this.seq.get(key) === id ? result : undefined
    } catch (error) {
      if (this.seq.get(key) === id) throw error
      return undefined
    } finally {
      if (this.controllers.get(key) === controller) this.controllers.delete(key)
    }
  }

  /** Abort whatever is in flight for `key` without starting a successor. */
  abort(key: string): void {
    this.seq.set(key, (this.seq.get(key) ?? 0) + 1)
    this.controllers.get(key)?.abort()
    this.controllers.delete(key)
  }
}
