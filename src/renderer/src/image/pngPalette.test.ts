import { describe, expect, it } from 'vitest'
import { readPngPalette } from './pngPalette'

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function chunk(type: string, data: number[]): number[] {
  const length = [
    (data.length >>> 24) & 0xff,
    (data.length >>> 16) & 0xff,
    (data.length >>> 8) & 0xff,
    data.length & 0xff
  ]
  const typeBytes = [...type].map((c) => c.charCodeAt(0))
  // CRC is not validated by the parser; four zero bytes suffice.
  return [...length, ...typeBytes, ...data, 0, 0, 0, 0]
}

function png(...chunks: number[][]): ArrayBuffer {
  return new Uint8Array([...SIGNATURE, ...chunks.flat()]).buffer
}

// A minimal IHDR payload (13 bytes); contents are irrelevant to the walk.
const IHDR = chunk('IHDR', new Array<number>(13).fill(0))

describe('readPngPalette', () => {
  it('parses PLTE triplets to #rrggbb in palette order', () => {
    const plte = chunk('PLTE', [0xff, 0x00, 0x00, 0x00, 0xff, 0x00, 0x12, 0x34, 0x56])
    expect(readPngPalette(png(IHDR, plte, chunk('IEND', [])))).toEqual([
      '#ff0000',
      '#00ff00',
      '#123456'
    ])
  })

  it('walks past other chunks to find PLTE', () => {
    const filler = chunk('tEXt', [0x61, 0x62, 0x63])
    const plte = chunk('PLTE', [0x01, 0x02, 0x03])
    expect(readPngPalette(png(IHDR, filler, plte, chunk('IEND', [])))).toEqual(['#010203'])
  })

  it('throws on a non-PNG buffer', () => {
    expect(() => readPngPalette(new Uint8Array([1, 2, 3, 4]).buffer)).toThrow('not a PNG')
  })

  it('throws when there is no PLTE chunk', () => {
    expect(() => readPngPalette(png(IHDR, chunk('IEND', [])))).toThrow('no PLTE')
  })

  it('throws on a PLTE length that is not a multiple of three', () => {
    const bad = chunk('PLTE', [0x01, 0x02])
    expect(() => readPngPalette(png(IHDR, bad, chunk('IEND', [])))).toThrow('malformed PLTE')
  })
})
