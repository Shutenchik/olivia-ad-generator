'use client'

import { Undo2, Redo2, ZoomIn, ZoomOut, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { useCanvasStore } from '@/store/canvas'
import type { CanvasFormat } from '@/types/canvas'
import { CANVAS_FORMATS } from '@/lib/canvas/formats'
import { cn } from '@/lib/utils'

const FORMAT_ICONS: Record<CanvasFormat, string> = {
  '1:1': '□',
  '4:5': '▯',
  '9:16': '▮',
  '16:9': '▭',
}

interface CanvasToolbarProps {
  zoom: number
  onZoomChange: (zoom: number) => void
  onExport: () => void
}

export default function CanvasToolbar({ zoom, onZoomChange, onExport }: CanvasToolbarProps) {
  const { format, setFormat, undo, redo, historyIndex, history } = useCanvasStore()

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2]
  const currentZoomIndex = ZOOM_STEPS.indexOf(zoom)

  const zoomIn = () => {
    const next = ZOOM_STEPS[currentZoomIndex + 1]
    if (next !== undefined) onZoomChange(next)
  }

  const zoomOut = () => {
    const prev = ZOOM_STEPS[currentZoomIndex - 1]
    if (prev !== undefined) onZoomChange(prev)
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-[#111113] border-b border-[#27272A]">
      <div className="flex items-center gap-1">
        {(Object.keys(CANVAS_FORMATS) as CanvasFormat[]).map((f) => (
          <Tooltip key={f}>
            <TooltipTrigger
              onClick={() => setFormat(f)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors',
                format === f
                  ? 'bg-[#E8D5B0]/10 text-[#E8D5B0] ring-1 ring-[#E8D5B0]/30'
                  : 'text-[#71717A] hover:text-[#FAFAF9] hover:bg-[#1A1A1D]',
              )}
              aria-label={`${CANVAS_FORMATS[f].label} — ${CANVAS_FORMATS[f].platform}`}
            >
              <span className="text-base leading-none">{FORMAT_ICONS[f]}</span>
              <span>{f}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {CANVAS_FORMATS[f].label} · {CANVAS_FORMATS[f].platform}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Separator orientation="vertical" className="h-5 bg-[#27272A]" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            className="h-7 w-7 flex items-center justify-center rounded text-[#71717A] hover:text-[#FAFAF9] disabled:opacity-40"
            onClick={undo}
            disabled={!canUndo}
            aria-label="Undo (⌘Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Undo · ⌘Z</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            className="h-7 w-7 flex items-center justify-center rounded text-[#71717A] hover:text-[#FAFAF9] disabled:opacity-40"
            onClick={redo}
            disabled={!canRedo}
            aria-label="Redo (⌘⇧Z)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Redo · ⌘⇧Z</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-5 bg-[#27272A]" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[#71717A] hover:text-[#FAFAF9]"
          onClick={zoomOut}
          disabled={currentZoomIndex <= 0}
          aria-label="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-[#71717A] w-10 text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[#71717A] hover:text-[#FAFAF9]"
          onClick={zoomIn}
          disabled={currentZoomIndex >= ZOOM_STEPS.length - 1}
          aria-label="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-5 bg-[#27272A]" />

      <Tooltip>
        <TooltipTrigger
          className="h-7 px-2 flex items-center gap-1.5 text-xs text-[#E8D5B0] hover:text-[#F5E6C8] hover:bg-[#E8D5B0]/10 rounded"
          onClick={onExport}
          aria-label="Export canvas"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Export as PNG</TooltipContent>
      </Tooltip>
    </div>
  )
}
