import { useRef, useState } from 'react'
import type { JSX } from 'react'

interface Props {
  onFile(file: File): void
  compact?: boolean
}

function pngOf(items: FileList | null): File | undefined {
  const file = items?.[0]
  return file !== undefined && file.type === 'image/png' ? file : undefined
}

export function DropZone({ onFile, compact = false }: Props): JSX.Element {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <div
      className={`drop-zone${over ? ' over' : ''}${compact ? ' compact' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        const file = pngOf(event.dataTransfer.files)
        if (file !== undefined) onFile(file)
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          inputRef.current?.click()
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        hidden
        onChange={(event) => {
          const file = pngOf(event.target.files)
          if (file !== undefined) onFile(file)
          event.target.value = ''
        }}
      />
      {compact ? 'Drop a PNG to replace' : 'Drop a PNG here, or click to browse'}
    </div>
  )
}
