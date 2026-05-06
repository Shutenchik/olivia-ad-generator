'use client'

import { Download, History, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UserButton } from '@clerk/nextjs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface AppHeaderProps {
  onHistoryOpen: () => void
  onExportAll: () => void
}

export default function AppHeader({ onHistoryOpen, onExportAll }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-3 bg-[#111113] border-b border-[#27272A] z-10">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#E8D5B0]" />
        <span className="font-serif italic text-lg text-[#FAFAF9] tracking-tight">Olivia</span>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            className="flex items-center gap-2 text-[#71717A] hover:text-[#FAFAF9] h-8 px-3 rounded text-xs"
            onClick={onHistoryOpen}
            aria-label="Open generation history"
          >
            <History className="w-4 h-4" />
            History
          </TooltipTrigger>
          <TooltipContent>Generation history</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            className="flex items-center gap-2 bg-[#E8D5B0] hover:bg-[#F5E6C8] text-[#0A0A0B] h-8 px-3 rounded text-xs font-medium"
            onClick={onExportAll}
            aria-label="Export all formats"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </TooltipTrigger>
          <TooltipContent>Export all 4 formats as ZIP</TooltipContent>
        </Tooltip>

        <UserButton
          appearance={{
            elements: {
              avatarBox: 'w-7 h-7',
            },
          }}
        />
      </div>
    </header>
  )
}
