import { describe, expect, it } from 'vitest'
import { buildColorTraceGraph, buildPipelineGraph, buildPosterizeGraph } from './graph'
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
        quantize: { mode: 'binarize', level: 100, colors: 8, grow: 0, useCustomPalette: false }
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
      pipeline({
        quantize: { mode: 'off', level: 100, colors: 8, grow: 1, useCustomPalette: false }
      })
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
        quantize: { mode: 'binarize', level: 100, colors: 8, grow: 0, useCustomPalette: false }
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

function posterizePipeline(colors: number, partial: Partial<Pipeline> = {}): Pipeline {
  // grow: 0 keeps the exact-match node assertions free of a grow param;
  // grow behavior is pinned by its own cases below.
  return pipeline({
    quantize: { mode: 'posterize', level: 128, colors, grow: 0, useCustomPalette: false },
    ...partial
  })
}

describe('buildPosterizeGraph', () => {
  it('chains enabled layers into a posterize node and outputs its image', () => {
    const graph = buildPosterizeGraph(
      'P1',
      posterizePipeline(4, { layers: [layer('a', 'image.rotate', { angle: 90 })] })
    )
    expect(graph.nodes).toEqual([
      { id: 'a', module: 'image.rotate', params: { angle: 90 } },
      { id: 'post', module: 'image.posterize', params: { colors: 4 } }
    ])
    expect(graph.edges).toEqual([
      { from_node: 'a', from_port: 'image', to_node: 'post', to_port: 'image' }
    ])
    expect(graph.bindings).toEqual([{ payload: 'P1', node: 'a', port: 'image' }])
    expect(graph.outputs).toEqual([{ node: 'post', port: 'image' }])
  })

  it('an empty stack binds the source straight to posterize', () => {
    const graph = buildPosterizeGraph('P1', posterizePipeline(8))
    expect(graph.nodes).toEqual([{ id: 'post', module: 'image.posterize', params: { colors: 8 } }])
    expect(graph.bindings).toEqual([{ payload: 'P1', node: 'post', port: 'image' }])
  })

  it('an explicit palette replaces colors on the posterize node', () => {
    const p = posterizePipeline(8)
    p.quantize.useCustomPalette = true
    p.quantize.palette = ['#ff0000', '#00ff00', '#0000ff']
    const graph = buildPosterizeGraph('P1', p)
    expect(graph.nodes).toEqual([
      {
        id: 'post',
        module: 'image.posterize',
        params: { palette: ['#ff0000', '#00ff00', '#0000ff'] }
      }
    ])
  })

  it('a remembered palette is ignored while custom mode is off', () => {
    const p = posterizePipeline(8)
    p.quantize.palette = ['#ff0000', '#00ff00', '#0000ff']
    p.quantize.useCustomPalette = false
    const graph = buildPosterizeGraph('P1', p)
    expect(graph.nodes[0].params).toEqual({ colors: 8 })
  })

  it('falls back to colors when the custom palette is too short to send', () => {
    const p = posterizePipeline(8)
    p.quantize.useCustomPalette = true
    // Duplicates collapse to one entry, below the server's 2-entry minimum.
    p.quantize.palette = ['#ff0000', '#FF0000']
    const graph = buildPosterizeGraph('P1', p)
    expect(graph.nodes[0].params).toEqual({ colors: 8 })
  })
})

describe('buildColorTraceGraph', () => {
  const PALETTE_2 = ['#ff0000', '#00ff00'] as const

  it('fans out one mask → trace → colorize branch per palette entry (N=2)', () => {
    const { graph, merged, branches } = buildColorTraceGraph('P1', posterizePipeline(2), PALETTE_2)
    expect(graph.nodes).toEqual([
      { id: 'post', module: 'image.posterize', params: { colors: 2 } },
      { id: 'mask0', module: 'image.colormask', params: { index: 0 } },
      { id: 'trace0', module: 'potrace.trace', params: { blacklevel: 0.5, turdsize: 2 } },
      { id: 'color0', module: 'svg.colorize', params: { fill: '#ff0000' } },
      { id: 'mask1', module: 'image.colormask', params: { index: 1 } },
      { id: 'trace1', module: 'potrace.trace', params: { blacklevel: 0.5, turdsize: 2 } },
      { id: 'color1', module: 'svg.colorize', params: { fill: '#00ff00' } },
      { id: 'merge0', module: 'svg.merge', params: {} }
    ])
    expect(graph.edges).toEqual([
      { from_node: 'post', from_port: 'image', to_node: 'mask0', to_port: 'image' },
      // colormask outputs on port 'mask', not 'image'.
      { from_node: 'mask0', from_port: 'mask', to_node: 'trace0', to_port: 'image' },
      { from_node: 'trace0', from_port: 'svg', to_node: 'color0', to_port: 'svg' },
      { from_node: 'post', from_port: 'image', to_node: 'mask1', to_port: 'image' },
      { from_node: 'mask1', from_port: 'mask', to_node: 'trace1', to_port: 'image' },
      { from_node: 'trace1', from_port: 'svg', to_node: 'color1', to_port: 'svg' },
      { from_node: 'color0', from_port: 'svg', to_node: 'merge0', to_port: 'under' },
      { from_node: 'color1', from_port: 'svg', to_node: 'merge0', to_port: 'over' }
    ])
    expect(graph.bindings).toEqual([{ payload: 'P1', node: 'post', port: 'image' }])
    expect(merged).toEqual({ node: 'merge0', port: 'svg' })
    expect(branches).toEqual([
      { node: 'color0', fill: '#ff0000' },
      { node: 'color1', fill: '#00ff00' }
    ])
    expect(graph.outputs).toEqual([
      { node: 'merge0', port: 'svg' },
      { node: 'color0', port: 'svg' },
      { node: 'color1', port: 'svg' }
    ])
  })

  it('carries an odd leftover branch into the next merge round (N=3)', () => {
    const { graph, merged } = buildColorTraceGraph('P1', posterizePipeline(3), [
      '#000000',
      '#808080',
      '#ffffff'
    ])
    const merges = graph.nodes.filter((n) => n.module === 'svg.merge').map((n) => n.id)
    expect(merges).toEqual(['merge0', 'merge1'])
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from_node: 'color0', from_port: 'svg', to_node: 'merge0', to_port: 'under' },
        { from_node: 'color1', from_port: 'svg', to_node: 'merge0', to_port: 'over' },
        { from_node: 'merge0', from_port: 'svg', to_node: 'merge1', to_port: 'under' },
        { from_node: 'color2', from_port: 'svg', to_node: 'merge1', to_port: 'over' }
      ])
    )
    expect(merged).toEqual({ node: 'merge1', port: 'svg' })
  })

  it('reduces five branches over two rounds (N=5)', () => {
    const { graph, merged } = buildColorTraceGraph('P1', posterizePipeline(5), [
      '#111111',
      '#222222',
      '#333333',
      '#444444',
      '#555555'
    ])
    // Round 1: merge0(c0,c1), merge1(c2,c3), c4 carried; round 2:
    // merge2(merge0, merge1), carried c4; round 3: merge3(merge2, c4).
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from_node: 'merge0', from_port: 'svg', to_node: 'merge2', to_port: 'under' },
        { from_node: 'merge1', from_port: 'svg', to_node: 'merge2', to_port: 'over' },
        { from_node: 'merge2', from_port: 'svg', to_node: 'merge3', to_port: 'under' },
        { from_node: 'color4', from_port: 'svg', to_node: 'merge3', to_port: 'over' }
      ])
    )
    expect(merged).toEqual({ node: 'merge3', port: 'svg' })
  })

  it('a single palette entry needs no merge and no duplicate output', () => {
    const { graph, merged, branches } = buildColorTraceGraph('P1', posterizePipeline(2), [
      '#123456'
    ])
    expect(graph.nodes.some((n) => n.module === 'svg.merge')).toBe(false)
    expect(merged).toEqual({ node: 'color0', port: 'svg' })
    expect(branches).toEqual([{ node: 'color0', fill: '#123456' }])
    expect(graph.outputs).toEqual([{ node: 'color0', port: 'svg' }])
  })

  it('shares the raster stack and trace params across branches', () => {
    const { graph } = buildColorTraceGraph(
      'P1',
      posterizePipeline(2, {
        layers: [layer('a', 'image.levels', { black: 10, white: 240, gamma: 1 })],
        trace: { blacklevel: 0.7, turdsize: 5 }
      }),
      ['#000000', '#ffffff']
    )
    expect(graph.bindings).toEqual([{ payload: 'P1', node: 'a', port: 'image' }])
    const traces = graph.nodes.filter((n) => n.module === 'potrace.trace')
    expect(traces).toHaveLength(2)
    for (const t of traces) expect(t.params).toEqual({ blacklevel: 0.7, turdsize: 5 })
  })

  it('threads grow into every mask node when set', () => {
    const p = posterizePipeline(2)
    p.quantize.grow = 2
    const { graph } = buildColorTraceGraph('P1', p, PALETTE_2)
    const masks = graph.nodes.filter((n) => n.module === 'image.colormask')
    expect(masks).toEqual([
      { id: 'mask0', module: 'image.colormask', params: { index: 0, grow: 2 } },
      { id: 'mask1', module: 'image.colormask', params: { index: 1, grow: 2 } }
    ])
  })

  it('omits grow at 0 so pre-grow cache keys still hit', () => {
    const { graph } = buildColorTraceGraph('P1', posterizePipeline(2), PALETTE_2)
    const masks = graph.nodes.filter((n) => n.module === 'image.colormask')
    expect(masks.map((n) => n.params)).toEqual([{ index: 0 }, { index: 1 }])
  })

  it('uses the explicit palette on the posterize node in the fan-out too', () => {
    const p = posterizePipeline(2)
    p.quantize.useCustomPalette = true
    p.quantize.palette = [...PALETTE_2]
    const { graph } = buildColorTraceGraph('P1', p, PALETTE_2)
    const post = graph.nodes.find((n) => n.id === 'post')
    expect(post?.params).toEqual({ palette: ['#ff0000', '#00ff00'] })
  })
})
