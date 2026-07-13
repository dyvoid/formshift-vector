import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createControlStream } from './throttle'

describe('createControlStream', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends the first input immediately and throttles the rest', () => {
    const sent: number[] = []
    const stream = createControlStream<number>((v) => sent.push(v), {
      rateMs: 100,
      commitOnly: false
    })

    stream.input(1)
    stream.input(2)
    stream.input(3)
    expect(sent).toEqual([1])

    vi.advanceTimersByTime(100)
    expect(sent).toEqual([1, 3])
  })

  it('trailing send carries the latest value, not the first deferred one', () => {
    const sent: number[] = []
    const stream = createControlStream<number>((v) => sent.push(v), {
      rateMs: 100,
      commitOnly: false
    })

    stream.input(1)
    vi.advanceTimersByTime(30)
    stream.input(2)
    vi.advanceTimersByTime(30)
    stream.input(3)
    vi.advanceTimersByTime(40)
    expect(sent).toEqual([1, 3])
  })

  it('sends spaced inputs without deferral', () => {
    const sent: number[] = []
    const stream = createControlStream<number>((v) => sent.push(v), {
      rateMs: 100,
      commitOnly: false
    })

    stream.input(1)
    vi.advanceTimersByTime(150)
    stream.input(2)
    expect(sent).toEqual([1, 2])
  })

  it('commit always sends and cancels any pending trailing send', () => {
    const sent: number[] = []
    const stream = createControlStream<number>((v) => sent.push(v), {
      rateMs: 100,
      commitOnly: false
    })

    stream.input(1)
    stream.input(2)
    stream.commit(5)
    vi.advanceTimersByTime(500)
    expect(sent).toEqual([1, 5])
  })

  it('commitOnly drops all intermediate inputs', () => {
    const sent: number[] = []
    const stream = createControlStream<number>((v) => sent.push(v), {
      rateMs: 100,
      commitOnly: true
    })

    stream.input(1)
    stream.input(2)
    vi.advanceTimersByTime(500)
    expect(sent).toEqual([])

    stream.commit(3)
    expect(sent).toEqual([3])
  })

  it('rateMs 0 streams every input', () => {
    const sent: number[] = []
    const stream = createControlStream<number>((v) => sent.push(v), {
      rateMs: 0,
      commitOnly: false
    })

    stream.input(1)
    stream.input(2)
    stream.input(3)
    expect(sent).toEqual([1, 2, 3])
  })

  it('dispose cancels a pending trailing send', () => {
    const sent: number[] = []
    const stream = createControlStream<number>((v) => sent.push(v), {
      rateMs: 100,
      commitOnly: false
    })

    stream.input(1)
    stream.input(2)
    stream.dispose()
    vi.advanceTimersByTime(500)
    expect(sent).toEqual([1])
  })
})
