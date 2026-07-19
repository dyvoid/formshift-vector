import { describe, expect, it } from 'vitest'
import { PALETTE_MAX, nextSwatch, normalizeHex, sanitizePalette } from './palette'

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

describe('nextSwatch', () => {
  it('returns a well-formed hex', () => {
    expect(nextSwatch([])).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('never repeats an entry already in the palette', () => {
    // Repeated adds must not collapse under sanitizePalette's dedupe — that
    // would make the editor's "+ Add" a silent no-op.
    let palette: string[] = []
    for (let i = 0; i < PALETTE_MAX; i += 1) {
      palette = sanitizePalette([...palette, nextSwatch(palette)])
      expect(palette).toHaveLength(i + 1)
    }
  })

  it('ignores case when checking what is taken', () => {
    const first = nextSwatch([])
    expect(nextSwatch([first.toUpperCase()])).not.toBe(first)
  })
})
