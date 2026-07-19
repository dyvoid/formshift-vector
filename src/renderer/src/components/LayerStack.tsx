// The layer stack: a reorderable raster stack over the pinned tail
// (quantize, then trace). Reordering is only possible within the raster
// stack — the quantize boundary is enforced by construction, not by
// validation messages (see the design doc's Pipeline architecture).

import type { JSX } from 'react'
import type { Pipeline, QuantizeMode, RasterLayer } from '../pipeline/model'
import { RASTER_LAYER_DEFS, createLayer, layerDef } from '../pipeline/model'
import { PaletteEditor } from './PaletteEditor'

export type ChangePhase = 'input' | 'commit'

interface Props {
  pipeline: Pipeline
  /** Modules the connected server lacks; disables the Posterize option. */
  missingModules?: readonly string[]
  /** Palette the last completed posterize run used (for the editor's proposal). */
  proposedPalette?: readonly string[]
  /** Raised while the palette eyedropper is open (see PaletteEditor). */
  onPickingChange?(active: boolean): void
  onChange(next: Pipeline, phase: ChangePhase): void
}

function moveLayer(layers: RasterLayer[], index: number, delta: -1 | 1): RasterLayer[] {
  const target = index + delta
  if (target < 0 || target >= layers.length) return layers
  const next = [...layers]
  const [layer] = next.splice(index, 1)
  next.splice(target, 0, layer)
  return next
}

interface SliderProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  format?(value: number): string
  onValue(value: number, phase: ChangePhase): void
}

function Slider({ label, min, max, step, value, format, onValue }: SliderProps): JSX.Element {
  return (
    <label>
      {label}: {format !== undefined ? format(value) : value}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onValue(Number(event.target.value), 'input')}
        onPointerUp={() => onValue(value, 'commit')}
        onKeyUp={() => onValue(value, 'commit')}
      />
    </label>
  )
}

export function LayerStack({
  pipeline,
  missingModules,
  proposedPalette,
  onPickingChange,
  onChange
}: Props): JSX.Element {
  const posterizeMissing =
    missingModules !== undefined && missingModules.length > 0
      ? `Server missing: ${missingModules.join(', ')}`
      : undefined

  function patch(partial: Partial<Pipeline>, phase: ChangePhase): void {
    onChange({ ...pipeline, ...partial }, phase)
  }

  function patchLayer(id: string, partial: Partial<RasterLayer>, phase: ChangePhase): void {
    patch({ layers: pipeline.layers.map((l) => (l.id === id ? { ...l, ...partial } : l)) }, phase)
  }

  return (
    <div className="layer-stack">
      <div className="add-layer">
        {RASTER_LAYER_DEFS.map((def) => (
          <button
            key={def.module}
            type="button"
            onClick={() =>
              patch({ layers: [...pipeline.layers, createLayer(def.module)] }, 'commit')
            }
          >
            + {def.label}
          </button>
        ))}
      </div>

      {pipeline.layers.map((layer, index) => {
        const def = layerDef(layer.module)
        return (
          <fieldset key={layer.id} className={`layer${layer.enabled ? '' : ' off'}`}>
            <legend>
              <label className="inline">
                <input
                  type="checkbox"
                  checked={layer.enabled}
                  onChange={(event) =>
                    patchLayer(layer.id, { enabled: event.target.checked }, 'commit')
                  }
                />
                {def.label}
              </label>
              <span className="layer-actions">
                <button
                  type="button"
                  aria-label={`Move ${def.label} up`}
                  disabled={index === 0}
                  onClick={() => patch({ layers: moveLayer(pipeline.layers, index, -1) }, 'commit')}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${def.label} down`}
                  disabled={index === pipeline.layers.length - 1}
                  onClick={() => patch({ layers: moveLayer(pipeline.layers, index, 1) }, 'commit')}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${def.label}`}
                  onClick={() =>
                    patch({ layers: pipeline.layers.filter((l) => l.id !== layer.id) }, 'commit')
                  }
                >
                  ✕
                </button>
              </span>
            </legend>
            {layer.enabled &&
              def.params.map((spec) => (
                <Slider
                  key={spec.key}
                  label={spec.label}
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={layer.params[spec.key] ?? spec.default}
                  onValue={(value, phase) =>
                    patchLayer(layer.id, { params: { ...layer.params, [spec.key]: value } }, phase)
                  }
                />
              ))}
          </fieldset>
        )
      })}

      <fieldset className={`layer pinned${pipeline.quantize.mode === 'off' ? ' off' : ''}`}>
        <legend>
          Quantize <span className="pin-note">pinned</span>
        </legend>
        <label>
          Mode
          <select
            value={pipeline.quantize.mode}
            onChange={(event) =>
              patch(
                { quantize: { ...pipeline.quantize, mode: event.target.value as QuantizeMode } },
                'commit'
              )
            }
          >
            <option value="off">Off</option>
            <option value="binarize">Binarize</option>
            <option
              value="posterize"
              disabled={posterizeMissing !== undefined}
              title={posterizeMissing}
            >
              Posterize
            </option>
          </select>
        </label>
        {pipeline.quantize.mode === 'binarize' && (
          <Slider
            label="Level"
            min={0}
            max={255}
            step={1}
            value={pipeline.quantize.level}
            onValue={(level, phase) => patch({ quantize: { ...pipeline.quantize, level } }, phase)}
          />
        )}
        {pipeline.quantize.mode === 'posterize' && (
          <>
            {!pipeline.quantize.useCustomPalette && (
              <Slider
                label="Colors"
                min={2}
                max={32}
                step={1}
                value={pipeline.quantize.colors}
                onValue={(colors, phase) =>
                  patch({ quantize: { ...pipeline.quantize, colors } }, phase)
                }
              />
            )}
            <PaletteEditor
              quantize={pipeline.quantize}
              proposedPalette={proposedPalette}
              onPickingChange={onPickingChange}
              onQuantize={(quantize, phase) => patch({ quantize }, phase)}
            />
            <Slider
              label="Seam overlap (px)"
              min={0}
              max={4}
              step={1}
              value={pipeline.quantize.grow}
              format={(v) => `${v}px`}
              onValue={(grow, phase) => patch({ quantize: { ...pipeline.quantize, grow } }, phase)}
            />
          </>
        )}
      </fieldset>

      <fieldset className="layer pinned">
        <legend>
          Trace <span className="pin-note">pinned</span>
        </legend>
        <Slider
          label="Detail recovery (blacklevel)"
          min={0}
          max={1}
          step={0.01}
          value={pipeline.trace.blacklevel}
          format={(v) => v.toFixed(2)}
          onValue={(blacklevel, phase) =>
            patch({ trace: { ...pipeline.trace, blacklevel } }, phase)
          }
        />
        <Slider
          label="Speckle removal (turdsize)"
          min={0}
          max={20}
          step={1}
          value={pipeline.trace.turdsize}
          format={(v) => `${v}px`}
          onValue={(turdsize, phase) => patch({ trace: { ...pipeline.trace, turdsize } }, phase)}
        />
      </fieldset>
    </div>
  )
}
