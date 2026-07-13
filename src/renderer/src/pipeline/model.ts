// The client's pipeline model, per the design doc's Pipeline architecture:
// a freely reorderable raster stack, then the pinned one-way door (binarize)
// and the trace step. The linear stack is a degenerate case of the server's
// graph; buildPipelineGraph() does the translation.

export type RasterModuleId = 'image.crop' | 'image.rotate' | 'image.levels'

export interface RasterLayer {
  /** Client-local identity, stable across reorders. */
  id: string
  module: RasterModuleId
  enabled: boolean
  params: Record<string, number>
}

/** Binarize is a layer too (on/off like every layer) but its position is pinned. */
export interface BinarizeSettings {
  enabled: boolean
  level: number
}

export interface TraceSettings {
  blacklevel: number
  turdsize: number
}

export interface Pipeline {
  layers: RasterLayer[]
  binarize: BinarizeSettings
  trace: TraceSettings
}

export interface ParamSpec {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
  /**
   * When set, the param is omitted from the graph at this value so the
   * server-side default applies (e.g. crop width 0 means "to the edge").
   */
  omitAt?: number
}

export interface LayerDef {
  module: RasterModuleId
  label: string
  params: ParamSpec[]
}

export const RASTER_LAYER_DEFS: readonly LayerDef[] = [
  {
    module: 'image.crop',
    label: 'Crop',
    params: [
      { key: 'x', label: 'X', min: 0, max: 8192, step: 1, default: 0 },
      { key: 'y', label: 'Y', min: 0, max: 8192, step: 1, default: 0 },
      {
        key: 'width',
        label: 'Width (0 = to edge)',
        min: 0,
        max: 8192,
        step: 1,
        default: 0,
        omitAt: 0
      },
      {
        key: 'height',
        label: 'Height (0 = to edge)',
        min: 0,
        max: 8192,
        step: 1,
        default: 0,
        omitAt: 0
      }
    ]
  },
  {
    module: 'image.rotate',
    label: 'Rotate',
    params: [{ key: 'angle', label: 'Angle (°ccw)', min: -180, max: 180, step: 1, default: 0 }]
  },
  {
    module: 'image.levels',
    label: 'Levels',
    params: [
      { key: 'black', label: 'Black point', min: 0, max: 254, step: 1, default: 0 },
      { key: 'white', label: 'White point', min: 1, max: 255, step: 1, default: 255 },
      { key: 'gamma', label: 'Gamma', min: 0.1, max: 5, step: 0.05, default: 1 }
    ]
  }
]

export function layerDef(module: RasterModuleId): LayerDef {
  const def = RASTER_LAYER_DEFS.find((d) => d.module === module)
  if (def === undefined) throw new Error(`unknown raster module: ${module}`)
  return def
}

let nextLayerId = 0

export function createLayer(module: RasterModuleId): RasterLayer {
  nextLayerId += 1
  const params: Record<string, number> = {}
  for (const spec of layerDef(module).params) params[spec.key] = spec.default
  return { id: `layer-${nextLayerId}`, module, enabled: true, params }
}

export const DEFAULT_PIPELINE: Pipeline = {
  layers: [],
  binarize: { enabled: false, level: 128 },
  trace: { blacklevel: 0.5, turdsize: 2 }
}
