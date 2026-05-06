'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'

const FONT_OPTIONS = [
  'DM Sans',
  'Instrument Serif',
  'Syne',
  'Playfair Display',
  'Inter',
  'Geist',
]

interface BrandKitProps {
  sessionId: string
}

interface BrandKitState {
  brandName: string
  primaryColor: string
  secondaryColor: string
  fontFamily: string
}

export default function BrandKit({ sessionId: _sessionId }: BrandKitProps) {
  const [expanded, setExpanded] = useState(false)
  const [brand, setBrand] = useState<BrandKitState>({
    brandName: '',
    primaryColor: '#E8D5B0',
    secondaryColor: '#0A0A0B',
    fontFamily: 'DM Sans',
  })

  const update = (key: keyof BrandKitState, value: string) =>
    setBrand((prev) => ({ ...prev, [key]: value }))

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full text-left group"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <Palette className="w-3.5 h-3.5 text-[#71717A]" />
          <span className="text-xs font-medium text-[#71717A] uppercase tracking-wider">
            Brand Kit
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-[#71717A]" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[#71717A]" />
        )}
      </button>

      <div className={cn('flex flex-col gap-3 mt-3', !expanded && 'hidden')}>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[#71717A] uppercase tracking-wider">Brand name</label>
          <input
            value={brand.brandName}
            onChange={(e) => update('brandName', e.target.value.trim())}
            placeholder="Acme Co."
            className="bg-[#1A1A1D] border border-[#27272A] rounded px-2.5 py-1.5 text-xs text-[#FAFAF9] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8D5B0]/50"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] text-[#71717A] uppercase tracking-wider">Primary</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brand.primaryColor}
                onChange={(e) => update('primaryColor', e.target.value)}
                className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                aria-label="Primary brand color"
              />
              <span className="text-xs text-[#71717A] font-mono">{brand.primaryColor}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] text-[#71717A] uppercase tracking-wider">Secondary</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brand.secondaryColor}
                onChange={(e) => update('secondaryColor', e.target.value)}
                className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                aria-label="Secondary brand color"
              />
              <span className="text-xs text-[#71717A] font-mono">{brand.secondaryColor}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[#71717A] uppercase tracking-wider">Font</label>
          <select
            value={brand.fontFamily}
            onChange={(e) => update('fontFamily', e.target.value)}
            className="bg-[#1A1A1D] border border-[#27272A] rounded px-2.5 py-1.5 text-xs text-[#FAFAF9] focus:outline-none focus:border-[#E8D5B0]/50 cursor-pointer"
            aria-label="Brand font family"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
