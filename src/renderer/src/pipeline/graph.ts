// Translates the linear layer stack into the server's graph model. Pure and
// deterministic so it is trivially unit-testable: same pipeline in, same
// graph out. Ordering rules live here and nowhere else: enabled raster
// layers in stack order, then the pinned quantize step (binarize, or
// posterize with a per-color fan-out), then trace.
//
// The posterize path is two graphs because the palette is only knowable from
// posterize's output (a palette-mode PNG; see image/pngPalette.ts):
// buildPosterizeGraph discovers the palette, buildColorTraceGraph fans out
// one colormask → trace → colorize branch per palette entry and merges them
// with a binary tree of svg.merge nodes (the server's merge takes exactly
// two inputs). The posterize re-run in the second job is a server cache hit.

import type { Graph, GraphNode, Edge, OutputRef } from '../server/types'
import type { Pipeline, RasterLayer } from './model'
import { layerDef } from './model'
import { PALETTE_MIN, sanitizePalette } from './palette'

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

/** Enabled raster layers chained into `post` (image.posterize); shared by
 *  both posterize-path graphs so their upstream recipes hash identically. */
function posterizeChain(payloadId: string, pipeline: Pipeline): Graph {
  const nodes: GraphNode[] = []
  const edges: Edge[] = []
  for (const layer of pipeline.layers) {
    if (!layer.enabled) continue
    nodes.push({ id: layer.id, module: layer.module, params: layerParams(layer) })
  }
  // palette and colors are mutually exclusive on the server; an explicit
  // palette replaces clustering with nearest-color mapping (server ADR 0020).
  // Sanitized here as well as in the editor: a mid-drag input state can hold
  // a transient duplicate, which the server would 422 on.
  const palette = pipeline.quantize.useCustomPalette
    ? sanitizePalette(pipeline.quantize.palette ?? [])
    : undefined
  nodes.push({
    id: 'post',
    module: 'image.posterize',
    params:
      palette !== undefined && palette.length >= PALETTE_MIN
        ? { palette }
        : { colors: pipeline.quantize.colors }
  })
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
    outputs: [{ node: 'post', port: IMAGE_PORT }]
  }
}

/**
 * Phase 1 of the posterize path: raster stack into posterize, outputting the
 * palette-mode PNG the client reads the palette from.
 */
export function buildPosterizeGraph(payloadId: string, pipeline: Pipeline): Graph {
  return posterizeChain(payloadId, pipeline)
}

export interface ColorTraceGraph {
  graph: Graph
  /** The merged SVG output (root of the svg.merge tree). */
  merged: OutputRef
  /** Per-branch svg outputs, index-aligned with the palette. */
  branches: { node: string; fill: string }[]
}

/**
 * Phase 2 of the posterize path: one colormask → trace → colorize branch per
 * palette entry, merged pairwise into a single SVG. Palette indices are
 * assumed to be 0..N-1 (the server's posterize produces exactly N used
 * indices; pinned by the color integration test).
 */
export function buildColorTraceGraph(
  payloadId: string,
  pipeline: Pipeline,
  palette: readonly string[]
): ColorTraceGraph {
  const base = posterizeChain(payloadId, pipeline)
  const nodes = [...base.nodes]
  const edges = [...base.edges]

  const branches: { node: string; fill: string }[] = []
  for (let i = 0; i < palette.length; i += 1) {
    const mask = `mask${i}`
    const trace = `trace${i}`
    const color = `color${i}`
    nodes.push(
      // grow omitted at 0: the server caches on canonical params, so absence
      // keeps cache hits on results computed before the grow param existed.
      {
        id: mask,
        module: 'image.colormask',
        params:
          pipeline.quantize.grow > 0
            ? { index: i, grow: pipeline.quantize.grow }
            : { index: i }
      },
      { id: trace, module: 'potrace.trace', params: { ...pipeline.trace } },
      { id: color, module: 'svg.colorize', params: { fill: palette[i] } }
    )
    edges.push(
      { from_node: 'post', from_port: IMAGE_PORT, to_node: mask, to_port: IMAGE_PORT },
      // colormask's output port is 'mask', not 'image'.
      { from_node: mask, from_port: 'mask', to_node: trace, to_port: IMAGE_PORT },
      { from_node: trace, from_port: 'svg', to_node: color, to_port: 'svg' }
    )
    branches.push({ node: color, fill: palette[i] })
  }

  // Pairwise merge rounds; an odd leftover carries into the next round.
  // svg.merge takes exactly two inputs (under/over) — no n-ary fan-in.
  let roots = branches.map((b) => b.node)
  let mergeIndex = 0
  while (roots.length > 1) {
    const next: string[] = []
    for (let i = 0; i + 1 < roots.length; i += 2) {
      const merge = `merge${mergeIndex}`
      mergeIndex += 1
      nodes.push({ id: merge, module: 'svg.merge', params: {} })
      edges.push(
        { from_node: roots[i], from_port: 'svg', to_node: merge, to_port: 'under' },
        { from_node: roots[i + 1], from_port: 'svg', to_node: merge, to_port: 'over' }
      )
      next.push(merge)
    }
    if (roots.length % 2 === 1) next.push(roots[roots.length - 1])
    roots = next
  }

  const merged: OutputRef = { node: roots[0], port: 'svg' }
  // Merged result first, then every branch — the per-branch outputs feed
  // progressive rendering (disjoint masks, so no output groups needed). With
  // a single palette entry the root IS the branch; don't list it twice.
  const outputs: OutputRef[] = [
    merged,
    ...branches
      .filter((b) => b.node !== merged.node)
      .map((b): OutputRef => ({ node: b.node, port: 'svg' }))
  ]

  return {
    graph: { nodes, edges, bindings: base.bindings, outputs },
    merged,
    branches
  }
}
