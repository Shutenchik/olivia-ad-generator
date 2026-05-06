'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useCanvasStore } from '@/store/canvas'
import AppHeader from '@/components/layout/AppHeader'
import CanvasToolbar from '@/components/canvas/CanvasToolbar'
import LayerPanel from '@/components/canvas/LayerPanel'
import UploadZone from '@/components/upload/UploadZone'
import ChatPanel from '@/components/chat/ChatPanel'
import HistoryPanel from '@/components/history/HistoryPanel'
import BrandKit from '@/components/brand/BrandKit'
import { Skeleton } from '@/components/ui/skeleton'
import JSZip from 'jszip'
import type { CanvasFormat } from '@/types/canvas'
import { CANVAS_FORMATS } from '@/lib/canvas/formats'

const CanvasEditor = dynamic(() => import('@/components/canvas/CanvasEditor'), {
  ssr: false,
  loading: () => <Skeleton className="w-full aspect-square rounded-lg bg-[#1A1A1D]" />,
})

export default function EditorClient() {
  const { sessionId, setSessionId, format, setFormat } = useCanvasStore()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [displayWidth, setDisplayWidth] = useState(540)

  useEffect(() => {
    const initSession = async () => {
      if (sessionId) return
      try {
        const res = await fetch('/api/session', { method: 'POST' })
        if (!res.ok) throw new Error(`Session API returned ${res.status}`)
        const data = (await res.json()) as { sessionId: string }
        if (data.sessionId) setSessionId(data.sessionId)
      } catch (err) {
        console.error('Session init failed, using local fallback:', err)
        const { v4: uuidv4 } = await import('uuid')
        setSessionId(uuidv4())
      }
    }
    initSession()
  }, [sessionId, setSessionId])

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setDisplayWidth(Math.floor(entry.contentRect.width))
    })
    if (canvasContainerRef.current) ro.observe(canvasContainerRef.current)
    return () => ro.disconnect()
  }, [])

  const handleExportAll = useCallback(async () => {
    const zip = new JSZip()
    const formats: CanvasFormat[] = ['1:1', '4:5', '9:16', '16:9']

    for (const fmt of formats) {
      const dims = CANVAS_FORMATS[fmt]
      zip.file(
        `olivia-${fmt.replace(':', 'x')}.txt`,
        `Canvas export placeholder for ${fmt} (${dims.width}x${dims.height})`,
      )
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'olivia-exports.zip'
    a.click()
  }, [])

  const handleExportSingle = useCallback(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'olivia-ad.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [])

  if (!sessionId) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0A0A0B]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-[#E8D5B0] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[#71717A]">Setting up your session…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0B] overflow-hidden">
      <AppHeader onHistoryOpen={() => setHistoryOpen(true)} onExportAll={handleExportAll} />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-60 flex-shrink-0 flex flex-col border-r border-[#27272A] bg-[#111113] overflow-y-auto">
          <div className="p-3 border-b border-[#27272A]">
            <UploadZone
              sessionId={sessionId}
              onAnalysisTriggered={() => {}}
            />
          </div>

          <div className="p-3 border-b border-[#27272A]">
            <LayerPanel />
          </div>

          <div className="p-3">
            <BrandKit sessionId={sessionId} />
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0B]">
          <CanvasToolbar
            zoom={zoom}
            onZoomChange={setZoom}
            onExport={handleExportSingle}
          />

          <div className="flex-1 flex items-center justify-center overflow-auto p-8">
            <div
              ref={canvasContainerRef}
              className="w-full max-w-2xl"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center top' }}
            >
              <CanvasEditor displayWidth={displayWidth} />
            </div>
          </div>
        </main>

        <aside className="w-80 flex-shrink-0 flex flex-col border-l border-[#27272A] overflow-hidden">
          <ChatPanel sessionId={sessionId} />
        </aside>
      </div>

      <HistoryPanel
        sessionId={sessionId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  )
}
