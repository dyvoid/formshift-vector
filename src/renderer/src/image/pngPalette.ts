// Reads the palette out of a palette-mode PNG. The server's image.posterize
// reports its palette only this way (embedded PLTE chunk, no palette port),
// and a canvas decode would flatten indices to RGBA — so this walks the PNG
// chunk structure directly. Transport-level decoding like toPng.ts, not image
// processing: no pixel data is touched.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0')
}

/**
 * Read the PLTE chunk of a PNG. Returns '#rrggbb' entries in palette order.
 * Throws on a non-PNG buffer, a malformed chunk walk, or a PNG without a
 * PLTE chunk (i.e. not palette-mode).
 */
export function readPngPalette(data: ArrayBuffer): string[] {
  const bytes = new Uint8Array(data)
  const view = new DataView(data)
  if (bytes.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) {
    throw new Error('not a PNG')
  }

  // Chunk walk: length (u32 BE), type (4 ascii bytes), data, crc (u32).
  let offset = PNG_SIGNATURE.length
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    )
    const dataStart = offset + 8
    if (dataStart + length > bytes.length) break
    if (type === 'PLTE') {
      if (length === 0 || length % 3 !== 0) throw new Error('malformed PLTE chunk')
      const palette: string[] = []
      for (let i = dataStart; i < dataStart + length; i += 3) {
        palette.push(`#${hexByte(bytes[i])}${hexByte(bytes[i + 1])}${hexByte(bytes[i + 2])}`)
      }
      return palette
    }
    if (type === 'IEND') break
    offset = dataStart + length + 4
  }
  throw new Error('PNG has no PLTE chunk (not a palette-mode image)')
}
