import { describe, expect, it } from 'vitest'
import { buildPipelineGraph } from './graph'
import type { Pipeline, RasterLayer } from './model'
import { DEFAULT_PIPELINE } from './model'

function layer(
  id: string,
  module: RasterLayer['module'],
  params: Record<string, number> = {},
  enabled = true
): RasterLayer {
  return { id, module, enabled, params }
}

function pipeline(partial: Partial<Pipeline>): Pipeline {
  return { ...DEFAULT_PIPELINE, ...partial }
}

describe('buildPipelineGraph', () => {
  it('an empty stack is a single trace node bound to the source', () => {
    const graph = buildPipelineGraph('P1', DEFAULT_PIPELINE)
    expect(graph.nodes).toEqual([
      { id: 'trace', module: 'potrace.trace', params: { blacklevel: 0.5, turdsize: 2 } }
    ])
    expect(graph.edges).toEqual([])
    expect(graph.bindings).toEqual([{ payload: 'P1', node: 'trace', port: 'image' }])
    expect(graph.outputs).toEqual([{ node: 'trace', port: 'svg' }])
  })

  it('chains enabled layers in stack order into trace', () => {
    const graph = buildPipelineGraph(
      'P1',
      pipeline({
        layers: [
          layer('a', 'image.rotate', { angle: 90 }),
          layer('b', 'image.levels', { black: 10, white: 240, gamma: 1 })
        ]
      })
    )
    expect(graph.nodes.map((n) => n.id)).toEqual(['a', 'b', 'trace'])
    expect(graph.edges).toEqual([
      { from_node: 'a', from_port: 'image', to_node: 'b', to_port: 'image' },
      { from_node: 'b', from_port: 'image', to_node: 'trace', to_port: 'image' }
    ])
    expect(graph.bindings).toEqual([{ payload: 'P1', node: 'a', port: 'image' }])
  })

  it('reordering layers reorders the chain', () => {
    const a = layer('a', 'image.rotate', { angle: 90 })
    const b = layer('b', 'image.levels')
    const before = buildPipelineGraph('P1', pipeline({ layers: [a, b] }))
    const after = buildPipelineGraph('P1', pipeline({ layers: [b, a] }))
    expect(before.nodes.map((n) => n.id)).toEqual(['a', 'b', 'trace'])
    expect(after.nodes.map((n) => n.id)).toEqual(['b', 'a', 'trace'])
    expect(after.bindings[0].node).toBe('b')
  })

  it('skips disabled layers entirely', () => {
    const graph = buildPipelineGraph(
      'P1',
      pipeline({
        layers: [layer('a', 'image.rotate', { angle: 90 }, false), layer('b', 'image.levels')]
      })
    )
    expect(graph.nodes.map((n) => n.id)).toEqual(['b', 'trace'])
    expect(graph.bindings[0].node).toBe('b')
  })

  it('binarize is pinned between the raster stack and trace', () => {
    const graph = buildPipelineGraph(
      'P1',
      pipeline({
        layers: [layer('a', 'image.levels')],
        quantize: { mode: 'binarize', level: 100, colors: 8 }
      })
    )
    expect(graph.nodes.map((n) => n.id)).toEqual(['a', 'binarize', 'trace'])
    expect(graph.nodes[1]).toEqual({
      id: 'binarize',
      module: 'image.threshold',
      params: { level: 100 }
    })
  })

  it('quantize mode off matches the old disabled-binarize behavior', () => {
    const off = buildPipelineGraph(
      'P1',
      pipeline({ quantize: { mode: 'off', level: 100, colors: 8 } })
    )
    expect(off).toEqual(buildPipelineGraph('P1', DEFAULT_PIPELINE))
  })

  it('supports a param-less invert layer', () => {
    const graph = buildPipelineGraph('P1', pipeline({ layers: [layer('a', 'image.invert')] }))
    expect(graph.nodes.map((n) => n.id)).toEqual(['a', 'trace'])
    expect(graph.nodes[0]).toEqual({ id: 'a', module: 'image.invert', params: {} })
  })

  it('taps the image feeding trace as a second output', () => {
    const withStack = buildPipelineGraph(
      'P1',
      pipeline({
        layers: [layer('a', 'image.rotate', { angle: 90 })],
        quantize: { mode: 'binarize', level: 100, colors: 8 }
      })
    )
    expect(withStack.outputs).toEqual([
      { node: 'trace', port: 'svg' },
      { node: 'binarize', port: 'image' }
    ])

    // No pre-processing: the source goes straight into trace, nothing to tap.
    const bare = buildPipelineGraph('P1', DEFAULT_PIPELINE)
    expect(bare.outputs).toEqual([{ node: 'trace', port: 'svg' }])
  })

  it('fills unset params with defaults and omits sentinel values', () => {
    const graph = buildPipelineGraph(
      'P1',
      pipeline({ layers: [layer('c', 'image.crop', { x: 10, width: 0, height: 120 })] })
    )
    // width omitted at its 0 sentinel (server crops to the edge); y falls
    // back to its default; height passes through.
    expect(graph.nodes[0].params).toEqual({ x: 10, y: 0, height: 120 })
  })
})
