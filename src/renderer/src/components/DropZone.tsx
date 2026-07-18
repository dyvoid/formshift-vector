import { useRef, useState } from 'react'
import type { JSX } from 'react'

interface Props {
  onFile(file: File): void
  compact?: boolean
}

function imageOf(items: FileList | null): File | undefined {
  const file = items?.[0]
  return file !== undefined && file.type.startsWith('image/') ? file : undefined
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
        const file = imageOf(event.dataTransfer.files)
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
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = imageOf(event.target.files)
          if (file !== undefined) onFile(file)
          event.target.value = ''
        }}
      />
      {compact ? 'Drop an image to replace' : 'Drop an image here, or click to browse'}
    </div>
  )
}
