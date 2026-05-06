'use client'

import { useState } from 'react'
import { Eye, EyeOff, Lock, Unlock, Image, Type, Trash2, GripVertical } from 'lucide-react'
import { useCanvasStore } from '@/store/canvas'
import type { Layer } from '@/types/canvas'
import { cn } from '@/lib/utils'

function LayerIcon({ type }: { type: Layer['type'] }) {
  if (type === 'image') return <Image className="w-3 h-3 text-[#71717A]" />
  if (type === 'text') return <Type className="w-3 h-3 text-[#71717A]" />
  return null
}

export default function LayerPanel() {
  const { layers, selectedLayerId, selectLayer, updateLayer, removeLayer, reorderLayers } =
    useCanvasStore()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)

  const reversedLayers = [...layers].reverse()

  const startEditName = (layer: Layer) => {
    setEditingId(layer.id)
    setEditingName(layer.name)
  }

  const commitEditName = (id: string) => {
    updateLayer(id, { name: editingName.trim() || 'Layer' })
    setEditingId(null)
  }

  const handleDragStart = (index: number) => setDraggingIndex(index)

  const handleDrop = (toIndex: number) => {
    if (draggingIndex === null || draggingIndex === toIndex) return
    const fromReal = layers.length - 1 - draggingIndex
    const toReal = layers.length - 1 - toIndex
    reorderLayers(fromReal, toReal)
    setDraggingIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider px-2 mb-1">
        Layers
      </p>
      {reversedLayers.length === 0 && (
        <p className="text-xs text-[#71717A] px-2 py-4 text-center">No layers yet</p>
      )}
      {reversedLayers.map((layer, index) => (
        <div
          key={layer.id}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOverIndex(index)
          }}
          onDrop={() => handleDrop(index)}
          onDragEnd={() => {
            setDraggingIndex(null)
            setDragOverIndex(null)
          }}
          onClick={() => selectLayer(layer.id)}
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer group transition-colors',
            selectedLayerId === layer.id
              ? 'bg-[#E8D5B0]/10 ring-1 ring-[#E8D5B0]/30'
              : 'hover:bg-[#1A1A1D]',
            dragOverIndex === index && draggingIndex !== index && 'border-t-2 border-[#E8D5B0]',
          )}
        >
          <GripVertical className="w-3 h-3 text-[#27272A] group-hover:text-[#71717A] flex-shrink-0" />
          <LayerIcon type={layer.type} />

          {editingId === layer.id ? (
            <input
              autoFocus
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => commitEditName(layer.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEditName(layer.id)
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="flex-1 min-w-0 bg-transparent text-xs text-[#FAFAF9] outline-none border-b border-[#E8D5B0]"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="flex-1 min-w-0 text-xs text-[#FAFAF9] truncate"
              onDoubleClick={(e) => {
                e.stopPropagation()
                startEditName(layer)
              }}
            >
              {layer.name}
            </span>
          )}

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                updateLayer(layer.id, { visible: !layer.visible })
              }}
              className="p-0.5 rounded hover:bg-[#27272A]"
              aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
            >
              {layer.visible ? (
                <Eye className="w-3 h-3 text-[#71717A]" />
              ) : (
                <EyeOff className="w-3 h-3 text-[#27272A]" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                updateLayer(layer.id, { locked: !layer.locked })
              }}
              className="p-0.5 rounded hover:bg-[#27272A]"
              aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
            >
              {layer.locked ? (
                <Lock className="w-3 h-3 text-[#E8D5B0]" />
              ) : (
                <Unlock className="w-3 h-3 text-[#71717A]" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                removeLayer(layer.id)
              }}
              className="p-0.5 rounded hover:bg-[#27272A]"
              aria-label="Delete layer"
            >
              <Trash2 className="w-3 h-3 text-[#71717A] hover:text-[#F87171]" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
