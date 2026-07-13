import { describe, expect, it } from 'vitest'
import { LatestGate } from './latest'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
} {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('LatestGate', () => {
  it('returns the result when the run is still the latest', async () => {
    const gate = new LatestGate()
    await expect(gate.run('k', () => Promise.resolve(42))).resolves.toBe(42)
  })

  it('discards a superseded result even if it resolves after the newer one', async () => {
    const gate = new LatestGate()
    const first = deferred<string>()
    const second = deferred<string>()

    const run1 = gate.run('k', () => first.promise)
    const run2 = gate.run('k', () => second.promise)

    second.resolve('new')
    first.resolve('stale')

    await expect(run2).resolves.toBe('new')
    await expect(run1).resolves.toBeUndefined()
  })

  it('aborts the in-flight predecessor', async () => {
    const gate = new LatestGate()
    let aborted = false

    const first = gate.run('k', (signal) => {
      return new Promise<string>((_, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })
    const second = gate.run('k', () => Promise.resolve('ok'))

    await expect(second).resolves.toBe('ok')
    await expect(first).resolves.toBeUndefined()
    expect(aborted).toBe(true)
  })

  it('propagates errors only from the latest run', async () => {
    const gate = new LatestGate()
    const first = deferred<string>()

    const run1 = gate.run('k', () => first.promise)
    const run2 = gate.run('k', () => Promise.reject(new Error('boom')))

    first.reject(new Error('stale failure'))

    await expect(run2).rejects.toThrow('boom')
    await expect(run1).resolves.toBeUndefined()
  })

  it('tracks keys independently', async () => {
    const gate = new LatestGate()
    const a = gate.run('a', () => Promise.resolve('a1'))
    const b = gate.run('b', () => Promise.resolve('b1'))
    await expect(a).resolves.toBe('a1')
    await expect(b).resolves.toBe('b1')
  })

  it('abort() cancels in-flight work and marks it stale', async () => {
    const gate = new LatestGate()
    let sawAbort = false

    const run = gate.run('k', (signal) => {
      return new Promise<string>((_, reject) => {
        signal.addEventListener('abort', () => {
          sawAbort = true
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })
    gate.abort('k')

    await expect(run).resolves.toBeUndefined()
    expect(sawAbort).toBe(true)
  })
})
