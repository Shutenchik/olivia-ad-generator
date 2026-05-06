import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore } from '@/store/canvas'
import type { ImageLayer } from '@/types/canvas'

function makeImageLayer(overrides: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: `layer-${Math.random()}`,
    type: 'image',
    name: 'test',
    src: 'https://example.com/img.jpg',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
    visible: true,
    ...overrides,
  }
}

describe('Canvas store', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      layers: [],
      history: [[]],
      historyIndex: 0,
      selectedLayerId: null,
    })
  })

  it('adds a layer and selects it', () => {
    const layer = makeImageLayer({ id: 'l1' })
    useCanvasStore.getState().addLayer(layer)
    const state = useCanvasStore.getState()
    expect(state.layers).toHaveLength(1)
    expect(state.selectedLayerId).toBe('l1')
  })

  it('removes a layer', () => {
    const layer = makeImageLayer({ id: 'l1' })
    useCanvasStore.getState().addLayer(layer)
    useCanvasStore.getState().removeLayer('l1')
    expect(useCanvasStore.getState().layers).toHaveLength(0)
  })

  it('undo restores previous layer state', () => {
    const layer = makeImageLayer({ id: 'l1' })
    useCanvasStore.getState().addLayer(layer)
    expect(useCanvasStore.getState().layers).toHaveLength(1)
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().layers).toHaveLength(0)
  })

  it('redo re-applies undone changes', () => {
    const layer = makeImageLayer({ id: 'l1' })
    useCanvasStore.getState().addLayer(layer)
    useCanvasStore.getState().undo()
    useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().layers).toHaveLength(1)
  })

  it('setFormat updates canvas dimensions', () => {
    useCanvasStore.getState().setFormat('9:16')
    const state = useCanvasStore.getState()
    expect(state.format).toBe('9:16')
    expect(state.canvasWidth).toBe(1080)
    expect(state.canvasHeight).toBe(1920)
  })

  it('reorderLayers changes layer order', () => {
    const l1 = makeImageLayer({ id: 'l1', name: 'first' })
    const l2 = makeImageLayer({ id: 'l2', name: 'second' })
    useCanvasStore.getState().addLayer(l1)
    useCanvasStore.getState().addLayer(l2)
    useCanvasStore.getState().reorderLayers(0, 1)
    const layers = useCanvasStore.getState().layers
    expect(layers[0]?.id).toBe('l2')
    expect(layers[1]?.id).toBe('l1')
  })
})
