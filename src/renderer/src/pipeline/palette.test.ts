import { describe, expect, it } from 'vitest'
import { normalizeHex, sanitizePalette } from './palette'

describe('normalizeHex', () => {
  it('passes through lowercase #rrggbb', () => {
    expect(normalizeHex('#a1b2c3')).toBe('#a1b2c3')
  })

  it('lowercases and accepts hashless input', () => {
    expect(normalizeHex('A1B2C3')).toBe('#a1b2c3')
    expect(normalizeHex('#A1B2C3')).toBe('#a1b2c3')
  })

  it('expands #rgb shorthand', () => {
    expect(normalizeHex('#f80')).toBe('#ff8800')
    expect(normalizeHex('f80')).toBe('#ff8800')
  })

  it('rejects garbage', () => {
    expect(normalizeHex('')).toBeUndefined()
    expect(normalizeHex('#12345')).toBeUndefined()
    expect(normalizeHex('#gggggg')).toBeUndefined()
    expect(normalizeHex('red')).toBeUndefined()
    expect(normalizeHex('#a1b2c3d4')).toBeUndefined()
  })
})

describe('sanitizePalette', () => {
  it('normalizes entries and preserves order', () => {
    expect(sanitizePalette(['#FF0000', '0f0', '#0000ff'])).toEqual([
      '#ff0000',
      '#00ff00',
      '#0000ff'
    ])
  })

  it('dedupes on normalized form, keeping first occurrence', () => {
    expect(sanitizePalette(['#abc', '#aabbcc', '#AABBCC', '#000000'])).toEqual([
      '#aabbcc',
      '#000000'
    ])
  })

  it('drops invalid entries', () => {
    expect(sanitizePalette(['nope', '#123456', ''])).toEqual(['#123456'])
  })
})
