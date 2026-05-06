import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Layer, CanvasFormat, ImageLayer, TextLayer, ShapeLayer } from '@/types/canvas'
import { CANVAS_FORMATS } from '@/lib/canvas/formats'
import { v4 as uuidv4 } from 'uuid'

interface CanvasStore {
  layers: Layer[]
  selectedLayerId: string | null
  history: Layer[][]
  historyIndex: number
  canvasWidth: number
  canvasHeight: number
  format: CanvasFormat
  isGenerating: boolean
  generationProgress: number
  sessionId: string | null
  currentAssetId: string | null
  currentAssetUrl: string | null

  addLayer: (layer: Omit<ImageLayer, 'id'> & { id?: string } | Omit<TextLayer, 'id'> & { id?: string } | Omit<ShapeLayer, 'id'> & { id?: string }) => void
  removeLayer: (id: string) => void
  updateLayer: (id: string, updates: Partial<Layer>) => void
  selectLayer: (id: string | null) => void
  reorderLayers: (fromIndex: number, toIndex: number) => void
  duplicateLayer: (id: string) => void
  undo: () => void
  redo: () => void
  setFormat: (format: CanvasFormat) => void
  setGenerating: (isGenerating: boolean, progress?: number) => void
  setSessionId: (sessionId: string) => void
  setCurrentAssetId: (assetId: string | null) => void
  setCurrentAssetUrl: (url: string | null) => void
  clearCanvas: () => void
}

const MAX_HISTORY = 50

function snapshotLayers(layers: Layer[]): Layer[] {
  return JSON.parse(JSON.stringify(layers)) as Layer[]
}

export const useCanvasStore = create<CanvasStore>()(
  persist(
    (set, get) => ({
      layers: [],
      selectedLayerId: null,
      history: [[]],
      historyIndex: 0,
      canvasWidth: CANVAS_FORMATS['1:1'].width,
      canvasHeight: CANVAS_FORMATS['1:1'].height,
      format: '1:1',
      isGenerating: false,
      generationProgress: 0,
      sessionId: null,
      currentAssetId: null,
      currentAssetUrl: null,

      addLayer: (layer) => {
        const id = layer.id ?? uuidv4()
        const newLayer = { ...layer, id } as Layer
        set((state) => {
          const newLayers = [...state.layers, newLayer]
          const newHistory = state.history.slice(0, state.historyIndex + 1)
          if (newHistory.length > MAX_HISTORY) newHistory.shift()
          return {
            layers: newLayers,
            history: [...newHistory, snapshotLayers(newLayers)],
            historyIndex: Math.min(state.historyIndex + 1, MAX_HISTORY - 1),
            selectedLayerId: id,
          }
        })
      },

      removeLayer: (id) => {
        set((state) => {
          const newLayers = state.layers.filter((l) => l.id !== id)
          const newHistory = state.history.slice(0, state.historyIndex + 1)
          if (newHistory.length > MAX_HISTORY) newHistory.shift()
          return {
            layers: newLayers,
            history: [...newHistory, snapshotLayers(newLayers)],
            historyIndex: Math.min(state.historyIndex + 1, MAX_HISTORY - 1),
            selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId,
          }
        })
      },

      updateLayer: (id, updates) => {
        set((state) => {
          const newLayers = state.layers.map((l) =>
            l.id === id ? ({ ...l, ...updates } as Layer) : l,
          )
          return { layers: newLayers }
        })
      },

      selectLayer: (id) => set({ selectedLayerId: id }),

      reorderLayers: (fromIndex, toIndex) => {
        set((state) => {
          const newLayers = [...state.layers]
          const [moved] = newLayers.splice(fromIndex, 1)
          if (moved) newLayers.splice(toIndex, 0, moved)
          const newHistory = state.history.slice(0, state.historyIndex + 1)
          return {
            layers: newLayers,
            history: [...newHistory, snapshotLayers(newLayers)],
            historyIndex: Math.min(state.historyIndex + 1, MAX_HISTORY - 1),
          }
        })
      },

      duplicateLayer: (id) => {
        const layer = get().layers.find((l) => l.id === id)
        if (!layer) return
        const newLayer = { ...layer, id: uuidv4(), x: (layer.x ?? 0) + 20, y: (layer.y ?? 0) + 20 }
        get().addLayer(newLayer)
      },

      undo: () => {
        set((state) => {
          if (state.historyIndex <= 0) return state
          const newIndex = state.historyIndex - 1
          const restored = snapshotLayers(state.history[newIndex] ?? [])
          return { layers: restored, historyIndex: newIndex }
        })
      },

      redo: () => {
        set((state) => {
          if (state.historyIndex >= state.history.length - 1) return state
          const newIndex = state.historyIndex + 1
          const restored = snapshotLayers(state.history[newIndex] ?? [])
          return { layers: restored, historyIndex: newIndex }
        })
      },

      setFormat: (format) => {
        const dims = CANVAS_FORMATS[format]
        set({
          format,
          canvasWidth: dims.width,
          canvasHeight: dims.height,
        })
      },

      setGenerating: (isGenerating, progress = 0) =>
        set({ isGenerating, generationProgress: progress }),

      setSessionId: (sessionId) => set({ sessionId }),

      setCurrentAssetId: (currentAssetId) => set({ currentAssetId }),

      setCurrentAssetUrl: (currentAssetUrl) => set({ currentAssetUrl }),

      clearCanvas: () =>
        set({
          layers: [],
          selectedLayerId: null,
          history: [[]],
          historyIndex: 0,
        }),
    }),
    {
      name: 'olivia-canvas-state',
      partialize: (state) => ({
        layers: state.layers,
        format: state.format,
        canvasWidth: state.canvasWidth,
        canvasHeight: state.canvasHeight,
        sessionId: state.sessionId,
      }),
    },
  ),
)
