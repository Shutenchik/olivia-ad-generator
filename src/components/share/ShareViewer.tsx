'use client'

import { Sparkles } from 'lucide-react'

interface ShareViewerProps {
  stateJson: unknown
}

export default function ShareViewer({ stateJson }: ShareViewerProps) {
  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0B] items-center justify-center gap-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-[#E8D5B0]" />
        <span className="font-serif italic text-xl text-[#FAFAF9]">Olivia</span>
      </div>
      <p className="text-sm text-[#71717A]">
        {stateJson ? 'Shared canvas — read only' : 'This link has no canvas state yet.'}
      </p>
    </div>
  )
}
