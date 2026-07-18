// Translates the linear layer stack into the server's graph model. Pure and
// deterministic so it is trivially unit-testable: same pipeline in, same
// graph out. Ordering rules live here and nowhere else: enabled raster
// layers in stack order, then binarize (the pinned one-way door), then trace.

import type { Graph, GraphNode, Edge, OutputRef } from '../server/types'
import type { Pipeline, RasterLayer } from './model'
import { layerDef } from './model'

const IMAGE_PORT = 'image'

/**
 * Modules the posterize (color-trace) path needs beyond the mono path.
 * Module names are the server's forward-only contract; this list only feeds
 * the connect-time capability probe (UX sugar — an actual submit against an
 * old server still fails loudly with the server's 422).
 */
export const COLOR_TRACE_MODULES: readonly string[] = [
  'image.posterize',
  'image.colormask',
  'svg.colorize',
  'svg.merge'
]

function layerParams(layer: RasterLayer): Record<string, number> {
  const params: Record<string, number> = {}
  for (const spec of layerDef(layer.module).params) {
    const value = layer.params[spec.key] ?? spec.default
    if (spec.omitAt !== undefined && value === spec.omitAt) continue
    params[spec.key] = value
  }
  return params
}

export function buildPipelineGraph(payloadId: string, pipeline: Pipeline): Graph {
  const nodes: GraphNode[] = []
  const edges: Edge[] = []

  for (const layer of pipeline.layers) {
    if (!layer.enabled) continue
    nodes.push({ id: layer.id, module: layer.module, params: layerParams(layer) })
  }
  if (pipeline.quantize.mode === 'binarize') {
    nodes.push({
      id: 'binarize',
      module: 'image.threshold',
      params: { level: pipeline.quantize.level }
    })
  }
  nodes.push({ id: 'trace', module: 'potrace.trace', params: { ...pipeline.trace } })

  for (let i = 1; i < nodes.length; i += 1) {
    edges.push({
      from_node: nodes[i - 1].id,
      from_port: IMAGE_PORT,
      to_node: nodes[i].id,
      to_port: IMAGE_PORT
    })
  }

  // Also tap the image feeding trace, so the client can preview the
  // pre-processed raster. Absent when the source goes straight into trace.
  const outputs: OutputRef[] = [{ node: 'trace', port: 'svg' }]
  if (nodes.length > 1) outputs.push({ node: nodes[nodes.length - 2].id, port: IMAGE_PORT })

  return {
    nodes,
    edges,
    bindings: [{ payload: payloadId, node: nodes[0].id, port: IMAGE_PORT }],
    outputs
  }
}
