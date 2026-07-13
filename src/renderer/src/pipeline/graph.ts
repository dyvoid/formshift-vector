// Translates the linear layer stack into the server's graph model. Pure and
// deterministic so it is trivially unit-testable: same pipeline in, same
// graph out. Ordering rules live here and nowhere else: enabled raster
// layers in stack order, then binarize (the pinned one-way door), then trace.

import type { Graph, GraphNode, Edge } from '../server/types'
import type { Pipeline, RasterLayer } from './model'
import { layerDef } from './model'

const IMAGE_PORT = 'image'

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
  if (pipeline.binarize.enabled) {
    nodes.push({
      id: 'binarize',
      module: 'image.threshold',
      params: { level: pipeline.binarize.level }
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

  return {
    nodes,
    edges,
    bindings: [{ payload: payloadId, node: nodes[0].id, port: IMAGE_PORT }],
    outputs: [{ node: 'trace', port: 'svg' }]
  }
}
