// The server's raster ingress speaks PNG ("raster/png" payloads), while the
// UI accepts any image the browser can decode. This is the funnel: re-encode
// on the way in, pass PNGs through untouched. Decode failures propagate to
// the caller, which owns user-facing error state.

export async function toPng(file: File): Promise<Blob> {
  if (file.type === 'image/png') return file
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('2d canvas unavailable')
    context.drawImage(bitmap, 0, 0)
    return await canvas.convertToBlob({ type: 'image/png' })
  } finally {
    bitmap.close()
  }
}
