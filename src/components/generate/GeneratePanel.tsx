'use client'

import { useCallback, useState } from 'react'
import { Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { useCanvasStore } from '@/store/canvas'
import { cn } from '@/lib/utils'

const STYLE_PRESETS: { id: string; label: string; prompt: string }[] = [
  { id: 'studio', label: 'Studio · soft', prompt: 'minimal seamless studio backdrop, soft diffused lighting, warm beige tones' },
  { id: 'marble', label: 'Marble · luxe', prompt: 'polished marble countertop, soft top light, elegant high-end editorial mood' },
  { id: 'outdoor', label: 'Outdoor · natural', prompt: 'sunlit outdoor scene, golden hour, soft greenery bokeh, lifestyle vibe' },
  { id: 'office', label: 'Office · airy', prompt: 'modern bright office, large windows, soft daylight, minimalist business setting' },
  { id: 'noir', label: 'Noir · cinematic', prompt: 'moody luxury hotel lobby at night, warm pools of light, brushed brass and dark wood, cinematic noir' },
  { id: 'pastel', label: 'Pastel · playful', prompt: 'pastel gradient backdrop, soft shadows, playful minimal product photography mood' },
]

export default function GeneratePanel() {
  const currentAssetUrl = useCanvasStore((s) => s.currentAssetUrl)
  const productCutoutUrl = useCanvasStore((s) => s.productCutoutUrl)
  const setProductCutoutUrl = useCanvasStore((s) => s.setProductCutoutUrl)
  const format = useCanvasStore((s) => s.format)
  const layers = useCanvasStore((s) => s.layers)
  const addLayer = useCanvasStore((s) => s.addLayer)
  const removeLayer = useCanvasStore((s) => s.removeLayer)
  const updateLayer = useCanvasStore((s) => s.updateLayer)
  const canvasWidth = useCanvasStore((s) => s.canvasWidth)
  const canvasHeight = useCanvasStore((s) => s.canvasHeight)
  const setGenerating = useCanvasStore((s) => s.setGenerating)
  const pingResult = useCanvasStore((s) => s.pingResult)

  const [prompt, setPrompt] = useState('')
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStage, setLoadingStage] = useState<'idle' | 'cutout' | 'background'>('idle')
  const [error, setError] = useState<string | null>(null)

  const hasProduct = !!currentAssetUrl
  const finalPrompt = prompt.trim().length > 0
    ? prompt.trim()
    : (STYLE_PRESETS.find((p) => p.id === activePreset)?.prompt ?? '')

  const handlePresetClick = (id: string) => {
    setActivePreset((prev) => (prev === id ? null : id))
  }

  const applyBackgroundLayer = useCallback(
    (imageUrl: string) => {
      const existing = layers.filter((l) => l.type === 'image' && l.name === 'background')
      existing.forEach((l) => removeLayer(l.id))
      addLayer({
        type: 'image',
        name: 'background',
        src: imageUrl,
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
        rotation: 0,
        opacity: 1,
        blendMode: 'normal',
        locked: false,
        visible: true,
      })
      pingResult()
    },
    [addLayer, removeLayer, layers, canvasWidth, canvasHeight, pingResult],
  )

  const ensureCutout = async (): Promise<string> => {
    if (productCutoutUrl) return productCutoutUrl
    if (!currentAssetUrl) throw new Error('No product image to cut out')

    setLoadingStage('cutout')
    const res = await fetch('/api/remove-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: currentAssetUrl }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `Cutout failed (${res.status})`)
    }
    const data = (await res.json()) as { imageUrl: string }
    if (!data.imageUrl) throw new Error('Cutout returned no image')

    setProductCutoutUrl(data.imageUrl)

    const productLayer = useCanvasStore
      .getState()
      .layers.find((l) => l.type === 'image' && l.name === 'product')
    if (productLayer) {
      updateLayer(productLayer.id, { src: data.imageUrl })
    }

    return data.imageUrl
  }

  const handleGenerate = async () => {
    if (!hasProduct || isLoading) return
    if (finalPrompt.length < 2) {
      setError('Pick a style preset or write a short scene description.')
      return
    }

    setError(null)
    setIsLoading(true)
    setGenerating(true, 20)

    try {
      await ensureCutout()

      setLoadingStage('background')
      setGenerating(true, 60)
      const sessionId = useCanvasStore.getState().sessionId ?? ''
      const res = await fetch('/api/generate-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-id': sessionId },
        body: JSON.stringify({ prompt: finalPrompt, aspectRatio: format }),
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }

      const data = (await res.json()) as { imageUrl: string }
      if (!data.imageUrl) throw new Error('No image returned')

      applyBackgroundLayer(data.imageUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsLoading(false)
      setLoadingStage('idle')
      setGenerating(false, 0)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-[#A1A1AA] font-medium">
          Generate background
        </span>
        {!hasProduct && (
          <span className="text-[10px] text-[#71717A]">upload product first</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STYLE_PRESETS.map((preset) => {
          const active = activePreset === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              disabled={!hasProduct}
              onClick={() => handlePresetClick(preset.id)}
              className={cn(
                'text-[11px] px-2 py-1 rounded-md border transition-colors',
                active
                  ? 'bg-[#E8D5B0] text-[#0A0A0B] border-[#E8D5B0]'
                  : 'border-[#27272A] text-[#A1A1AA] hover:border-[#E8D5B0]/60 hover:text-[#FAFAF9]',
                !hasProduct && 'opacity-40 cursor-not-allowed',
              )}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={!hasProduct || isLoading}
        placeholder={
          activePreset
            ? 'Optional: refine the scene (e.g. "warmer tones, brass accents")'
            : 'Describe the SCENE only: e.g. "marble countertop, soft top light". No edit commands.'
        }
        rows={2}
        className={cn(
          'w-full text-xs bg-[#0A0A0B] border border-[#27272A] rounded-md px-2.5 py-2 text-[#FAFAF9] placeholder:text-[#52525B]',
          'focus:outline-none focus:border-[#E8D5B0]/60 resize-none',
          (!hasProduct || isLoading) && 'opacity-60 cursor-not-allowed',
        )}
      />

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!hasProduct || isLoading || finalPrompt.length < 2}
        className={cn(
          'flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-semibold transition-colors',
          'bg-[#E8D5B0] text-[#0A0A0B] hover:bg-[#F5E6C8]',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#E8D5B0]',
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {loadingStage === 'cutout' ? 'Cutting out product…' : 'Generating scene…'}
          </>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5" />
            Generate background
          </>
        )}
      </button>

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-[#F87171] bg-[#F87171]/5 border border-[#F87171]/20 rounded-md px-2 py-1.5">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
