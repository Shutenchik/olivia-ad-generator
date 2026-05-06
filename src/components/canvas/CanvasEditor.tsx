'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Text as KonvaText,
  Transformer,
  Rect,
} from 'react-konva'
import type Konva from 'konva'
import { useCanvasStore } from '@/store/canvas'
import type { ImageLayer, TextLayer, Layer as CanvasLayer } from '@/types/canvas'
import { CANVAS_FORMATS } from '@/lib/canvas/formats'
import useImage from 'use-image'

function KonvaImageNode({
  layer,
  isSelected,
  onSelect,
  onUpdate,
}: {
  layer: ImageLayer
  isSelected: boolean
  onSelect: () => void
  onUpdate: (updates: Partial<ImageLayer>) => void
}) {
  const [image] = useImage(layer.src, 'anonymous')
  const nodeRef = useRef<Konva.Image>(null)
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    if (!isSelected || !trRef.current || !nodeRef.current) return
    trRef.current.nodes([nodeRef.current])
    trRef.current.getLayer()?.batchDraw()
  }, [isSelected])

  return (
    <>
      <KonvaImage
        ref={nodeRef}
        image={image}
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        rotation={layer.rotation}
        opacity={layer.opacity}
        visible={layer.visible}
        draggable={!layer.locked}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onUpdate({ x: e.target.x(), y: e.target.y() })
        }}
        onTransformEnd={(e) => {
          const node = e.target as Konva.Image
          onUpdate({
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * node.scaleX()),
            height: Math.max(5, node.height() * node.scaleY()),
            rotation: node.rotation(),
          })
          node.scaleX(1)
          node.scaleY(1)
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
          }
        />
      )}
    </>
  )
}

function KonvaTextNode({
  layer,
  isSelected,
  onSelect,
  onUpdate,
}: {
  layer: TextLayer
  isSelected: boolean
  onSelect: () => void
  onUpdate: (updates: Partial<TextLayer>) => void
}) {
  const nodeRef = useRef<Konva.Text>(null)
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    if (!isSelected || !trRef.current || !nodeRef.current) return
    trRef.current.nodes([nodeRef.current])
    trRef.current.getLayer()?.batchDraw()
  }, [isSelected])

  return (
    <>
      <KonvaText
        ref={nodeRef}
        text={layer.text}
        x={layer.x}
        y={layer.y}
        width={layer.width}
        fontSize={layer.fontSize}
        fontFamily={layer.fontFamily}
        fontStyle={layer.fontWeight}
        fill={layer.fill}
        rotation={layer.rotation}
        visible={layer.visible}
        draggable={!layer.locked}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onUpdate({ x: e.target.x(), y: e.target.y() })
        }}
        onTransformEnd={(e) => {
          const node = e.target as Konva.Text
          onUpdate({
            x: node.x(),
            y: node.y(),
            width: Math.max(50, node.width() * node.scaleX()),
            rotation: node.rotation(),
          })
          node.scaleX(1)
          node.scaleY(1)
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          enabledAnchors={['middle-left', 'middle-right']}
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 50 ? oldBox : newBox)}
        />
      )}
    </>
  )
}

interface CanvasEditorProps {
  displayWidth?: number
  displayHeight?: number
}

export default function CanvasEditor({ displayWidth = 540, displayHeight }: CanvasEditorProps) {
  const {
    layers,
    selectedLayerId,
    canvasWidth,
    canvasHeight,
    format,
    isGenerating,
    selectLayer,
    updateLayer,
    removeLayer,
    duplicateLayer,
    undo,
    redo,
  } = useCanvasStore()

  const stageRef = useRef<Konva.Stage>(null)
  const [scale, setScale] = useState(1)

  const formatDims = CANVAS_FORMATS[format]
  const computedHeight = displayHeight ?? (displayWidth / formatDims.width) * formatDims.height

  useEffect(() => {
    setScale(displayWidth / canvasWidth)
  }, [displayWidth, canvasWidth])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault()
        redo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault()
        if (selectedLayerId) duplicateLayer(selectedLayerId)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLayerId) removeLayer(selectedLayerId)
        return
      }

      if (!selectedLayerId) return
      const nudge = e.shiftKey ? 10 : 1
      const layer = layers.find((l) => l.id === selectedLayerId)
      if (!layer) return

      const moves: Record<string, { x?: number; y?: number }> = {
        ArrowLeft: { x: (layer.x ?? 0) - nudge },
        ArrowRight: { x: (layer.x ?? 0) + nudge },
        ArrowUp: { y: (layer.y ?? 0) - nudge },
        ArrowDown: { y: (layer.y ?? 0) + nudge },
      }

      const move = moves[e.key]
      if (move) {
        e.preventDefault()
        updateLayer(selectedLayerId, move)
      }
    },
    [selectedLayerId, layers, undo, redo, duplicateLayer, removeLayer, updateLayer],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const imageLayers = layers.filter((l): l is ImageLayer => l.type === 'image')
  const textLayers = layers.filter((l): l is TextLayer => l.type === 'text')

  return (
    <div
      className={`relative rounded-lg overflow-hidden ${isGenerating ? 'ring-2 ring-[#E8D5B0] animate-pulse' : 'ring-1 ring-[#27272A]'}`}
      style={{ width: displayWidth, height: computedHeight }}
    >
      <Stage
        ref={stageRef}
        width={displayWidth}
        height={computedHeight}
        scaleX={scale}
        scaleY={scale}
        onClick={(e) => {
          if (e.target === e.target.getStage()) selectLayer(null)
        }}
      >
        <Layer>
          <Rect width={canvasWidth} height={canvasHeight} fill="#1A1A1D" />
          {imageLayers
            .filter((l) => l.name === 'background')
            .map((layer) => (
              <KonvaImageNode
                key={layer.id}
                layer={layer}
                isSelected={selectedLayerId === layer.id}
                onSelect={() => selectLayer(layer.id)}
                onUpdate={(updates) => updateLayer(layer.id, updates)}
              />
            ))}
        </Layer>
        <Layer>
          {imageLayers
            .filter((l) => l.name !== 'background')
            .map((layer) => (
              <KonvaImageNode
                key={layer.id}
                layer={layer}
                isSelected={selectedLayerId === layer.id}
                onSelect={() => selectLayer(layer.id)}
                onUpdate={(updates) => updateLayer(layer.id, updates)}
              />
            ))}
        </Layer>
        <Layer>
          {textLayers.map((layer) => (
            <KonvaTextNode
              key={layer.id}
              layer={layer}
              isSelected={selectedLayerId === layer.id}
              onSelect={() => selectLayer(layer.id)}
              onUpdate={(updates) => updateLayer(layer.id, updates)}
            />
          ))}
        </Layer>
      </Stage>

      {isGenerating && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#E8D5B0] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#E8D5B0] text-sm font-medium">Generating…</span>
          </div>
        </div>
      )}
    </div>
  )
}
