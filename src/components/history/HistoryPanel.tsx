'use client'

import { useQuery } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Clock, DollarSign } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface GenerationItem {
  id: string
  prompt: string
  model: string
  tool: string
  status: string
  costUsd: string | null
  latencyMs: number | null
  createdAt: string
  thumbnailUrl: string | null
}

interface HistoryPanelProps {
  sessionId: string
  open: boolean
  onClose: () => void
}

export default function HistoryPanel({ sessionId, open, onClose }: HistoryPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['history', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/history?sessionId=${sessionId}`)
      if (!res.ok) throw new Error('Failed to load history')
      return res.json() as Promise<{ generations: GenerationItem[] }>
    },
    enabled: open && !!sessionId,
    refetchInterval: open ? 5000 : false,
  })

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[420px] bg-[#111113] border-l border-[#27272A] text-[#FAFAF9]"
      >
        <SheetHeader className="pb-4 border-b border-[#27272A]">
          <SheetTitle className="text-[#FAFAF9] font-medium">Generation History</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-3 py-4 overflow-y-auto max-h-[calc(100vh-100px)]">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-16 h-16 rounded-lg flex-shrink-0 bg-[#1A1A1D]" />
                <div className="flex flex-col gap-2 flex-1">
                  <Skeleton className="h-3 w-full bg-[#1A1A1D]" />
                  <Skeleton className="h-3 w-2/3 bg-[#1A1A1D]" />
                </div>
              </div>
            ))}

          {!isLoading && (data?.generations?.length ?? 0) === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Clock className="w-8 h-8 text-[#27272A]" />
              <p className="text-sm text-[#71717A]">No generations yet</p>
              <p className="text-xs text-[#27272A]">
                Start chatting to generate your first ad
              </p>
            </div>
          )}

          {data?.generations?.map((item) => (
            <div
              key={item.id}
              className="flex gap-3 p-3 rounded-lg bg-[#1A1A1D] border border-[#27272A] hover:border-[#71717A] transition-colors"
            >
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt={item.prompt}
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-[#27272A] flex-shrink-0 flex items-center justify-center">
                  <span className="text-xs text-[#71717A] font-mono">{item.tool.slice(0, 3)}</span>
                </div>
              )}

              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <p className="text-xs text-[#FAFAF9] truncate leading-relaxed">{item.prompt}</p>

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 border-[#27272A] text-[#71717A] font-mono"
                  >
                    {item.tool}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 border-transparent ${
                      item.status === 'done'
                        ? 'bg-[#4ADE80]/10 text-[#4ADE80]'
                        : item.status === 'error'
                          ? 'bg-[#F87171]/10 text-[#F87171]'
                          : 'bg-[#E8D5B0]/10 text-[#E8D5B0]'
                    }`}
                  >
                    {item.status}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 text-[10px] text-[#71717A]">
                  {item.costUsd && (
                    <span className="flex items-center gap-0.5 font-mono">
                      <DollarSign className="w-2.5 h-2.5" />
                      {parseFloat(item.costUsd).toFixed(4)}
                    </span>
                  )}
                  {item.latencyMs && (
                    <span className="font-mono">{(item.latencyMs / 1000).toFixed(1)}s</span>
                  )}
                  <span>
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
