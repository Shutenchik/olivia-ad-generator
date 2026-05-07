'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, TextStreamChatTransport, isTextUIPart, isToolUIPart } from 'ai'
import { Send, Square, Bot, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCanvasStore } from '@/store/canvas'
import { cn } from '@/lib/utils'
import type { TextLayer } from '@/types/canvas'
import { v4 as uuidv4 } from 'uuid'

const PLACEHOLDER_PROMPTS = [
  'Make the background warmer…',
  'Add a bold headline…',
  'Try an outdoor setting…',
  'Make it more luxurious…',
  'Use festive lighting…',
]

interface ToolResult {
  backgroundUrl?: string
  signedUrl?: string
  suggestedPrompts?: string[]
  text?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: string
  color?: string
}

interface ChatPanelProps {
  sessionId: string
  onSuggestedPrompt?: (prompt: string) => void
  onRegisterSendAnalysis?: (fn: (assetId: string, assetUrl: string, filename: string, base64?: string, mimeType?: string) => void) => void
}

function CostMeter({ cost }: { cost: number }) {
  const pct = Math.min(cost / 1.0, 1)
  const colorClass =
    pct > 0.7 ? 'text-[#F87171]' : pct > 0.3 ? 'text-yellow-400' : 'text-[#4ADE80]'

  return (
    <div className={cn('flex items-center gap-1 text-xs tabular-nums font-mono', colorClass)}>
      <DollarSign className="w-3 h-3" />
      <span>{cost.toFixed(3)} used</span>
    </div>
  )
}

export default function ChatPanel({ sessionId, onSuggestedPrompt, onRegisterSendAnalysis }: ChatPanelProps) {
  const { addLayer, canvasWidth, canvasHeight, currentAssetId, currentAssetUrl } = useCanvasStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [sessionCost, setSessionCost] = useState(0)
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([])
  const [inputValue, setInputValue] = useState('')

  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_PROMPTS.length)
    }, 3000)
    return () => clearInterval(id)
  }, [])

  const currentAssetIdRef = useRef<string | null>(null)
  const currentAssetUrlRef = useRef<string | null>(null)
  const currentAssetBase64Ref = useRef<string | null>(null)
  const currentAssetMimeTypeRef = useRef<string | null>(null)
  useEffect(() => { currentAssetIdRef.current = currentAssetId ?? null }, [currentAssetId])
  useEffect(() => { currentAssetUrlRef.current = currentAssetUrl ?? null }, [currentAssetUrl])

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: '/api/agent',
        body: { sessionId },
        prepareSendMessagesRequest: ({ id, messages, body }) => ({
          body: {
            id,
            messages,
            ...(body ?? {}),
            currentAssetId: currentAssetIdRef.current,
            currentAssetUrl: currentAssetUrlRef.current,
            currentAssetBase64: currentAssetBase64Ref.current,
            currentAssetMimeType: currentAssetMimeTypeRef.current,
          },
        }),
      }),
    [sessionId],
  )

  const { messages, sendMessage, stop, status } = useChat({
    transport,
    onToolCall: ({ toolCall }) => {
      const tc = toolCall as unknown as { type: string; input: ToolResult }
      const toolName = tc.type?.replace(/^tool-/, '') ?? ''
      if (toolName !== 'addHeadline') return

      const result = tc.input
      if (!result?.text) return

      const textLayer: TextLayer = {
        id: uuidv4(),
        type: 'text',
        name: 'headline',
        text: result.text,
        x: canvasWidth * 0.1,
        y: canvasHeight * 0.1,
        fontFamily: result.fontFamily ?? 'DM Sans',
        fontSize: result.fontSize ?? 72,
        fontWeight: result.fontWeight ?? '700',
        fill: result.color ?? '#FAFAF9',
        rotation: 0,
        width: canvasWidth * 0.8,
        locked: false,
        visible: true,
      }
      addLayer(textLayer)
    },
    onFinish: (options) => {
      const msg = options.message
      const textContent = msg.parts
        .filter(isTextUIPart)
        .map((p) => p.text)
        .join('')
      const costMatch = textContent.match(/cost: \$([0-9.]+)/)

      if (costMatch?.[1]) {
        setSessionCost((prev) => prev + parseFloat(costMatch[1] ?? '0'))
      }

      for (const part of msg.parts) {
        if (!isToolUIPart(part)) continue
        const toolPart = part as unknown as {
          type: string
          state: string
          output?: ToolResult
        }
        const toolName = toolPart.type.replace(/^tool-/, '')
        if (toolName !== 'detectProductType') continue
        if (toolPart.state !== 'output-available' || !toolPart.output) continue
        if (toolPart.output.suggestedPrompts?.length) {
          setSuggestedPrompts(toolPart.output.suggestedPrompts)
        }
      }
    },
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    onRegisterSendAnalysis?.((assetId, assetUrl, filename, base64, mimeType) => {
      currentAssetIdRef.current = assetId
      currentAssetUrlRef.current = assetUrl
      currentAssetBase64Ref.current = base64 ?? null
      currentAssetMimeTypeRef.current = mimeType ?? null

      const parts: { type: string; text?: string; image?: string; mimeType?: string }[] = [
        {
          type: 'text',
          text: `I've uploaded a product image: ${filename}\nAsset ID: ${assetId}\n\nPlease analyze this product and suggest the best ad backgrounds for it.`,
        },
      ]

      if (base64 && mimeType) {
        parts.push({ type: 'image', image: base64, mimeType })
      }

      sendMessage({ role: 'user', parts } as Parameters<typeof sendMessage>[0])
    })
  }, [onRegisterSendAnalysis, sendMessage])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = () => {
    const text = inputValue.trim()
    if (!text) return
    sendMessage({ role: 'user', parts: [{ type: 'text', text }] })
    setInputValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const sendSuggestion = (prompt: string) => {
    sendMessage({ role: 'user', parts: [{ type: 'text', text: prompt }] })
    setSuggestedPrompts([])
    onSuggestedPrompt?.(prompt)
  }

  return (
    <div className="flex flex-col h-full bg-[#111113]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272A]">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-[#E8D5B0]" />
          <span className="text-sm font-medium text-[#FAFAF9]">AI Director</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-[#27272A] text-[#71717A] font-mono">
            gpt-4o
          </span>
        </div>
        <CostMeter cost={sessionCost} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3" ref={scrollRef}>
        <div className="flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="p-3 rounded-full bg-[#1A1A1D]">
                <Bot className="w-6 h-6 text-[#E8D5B0]" />
              </div>
              <p className="text-sm text-[#71717A] max-w-[220px]">
                Upload a product image and I'll create a stunning ad for you.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                  message.role === 'user'
                    ? 'bg-[#27272A] text-[#FAFAF9]'
                    : 'bg-[#1A1A1D] text-[#FAFAF9] shadow-sm',
                )}
              >
                {message.parts.map((part, i) => {
                  if (isTextUIPart(part)) {
                    return (
                      <p key={i} className="leading-relaxed whitespace-pre-wrap">
                        {part.text}
                      </p>
                    )
                  }

                  if (isToolUIPart(part)) {
                    const toolPart = part as unknown as {
                      type: string
                      state: string
                      output?: ToolResult
                    }
                    const toolName = toolPart.type.replace(/^tool-/, '')
                    const isDone = toolPart.state === 'output-available'
                    const isRunning =
                      toolPart.state === 'input-streaming' ||
                      toolPart.state === 'input-available'

                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 py-1 px-2 rounded bg-[#27272A]/50 my-1"
                      >
                        <span className="text-xs text-[#71717A] font-mono">{toolName}</span>
                        {isRunning && (
                          <div className="w-3 h-3 border border-[#E8D5B0] border-t-transparent rounded-full animate-spin" />
                        )}
                        {isDone && <span className="text-xs text-[#4ADE80]">✓</span>}
                        {isDone &&
                          toolPart.output &&
                          (toolName === 'generateBackground' ||
                            toolName === 'inpaintBackground' ||
                            toolName === 'removeBackground') && (
                            <ResultImageThumb result={toolPart.output} />
                          )}
                      </div>
                    )
                  }

                  return null
                })}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-[#1A1A1D] rounded-lg px-3 py-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#71717A] animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#71717A] animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#71717A] animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {suggestedPrompts.length > 0 && (
        <div className="px-4 py-2 flex flex-wrap gap-2 border-t border-[#27272A]">
          {suggestedPrompts.map((prompt, i) => (
            <button
              key={i}
              onClick={() => sendSuggestion(prompt)}
              className="text-xs px-2.5 py-1.5 rounded-full bg-[#1A1A1D] text-[#FAFAF9] border border-[#27272A] hover:border-[#E8D5B0]/50 hover:text-[#E8D5B0] transition-all duration-200"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              ✦ {prompt}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 py-3 border-t border-[#27272A]">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDER_PROMPTS[placeholderIndex] ?? ''}
            rows={1}
            className="flex-1 resize-none bg-[#1A1A1D] border border-[#27272A] rounded-lg px-3 py-2 text-sm text-[#FAFAF9] placeholder:text-[#71717A] focus:outline-none focus:border-[#E8D5B0]/50 max-h-24 leading-relaxed"
            onInput={(e) => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = `${Math.min(t.scrollHeight, 96)}px`
            }}
            aria-label="Chat message"
          />
          {isLoading ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 flex-shrink-0 text-[#F87171] hover:text-[#F87171] hover:bg-[#F87171]/10"
              onClick={stop}
              aria-label="Stop generation"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              disabled={!inputValue.trim()}
              className="h-9 w-9 flex-shrink-0 bg-[#E8D5B0] hover:bg-[#F5E6C8] text-[#0A0A0B]"
              onClick={handleSend}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultImageThumb({ result }: { result: ToolResult }) {
  const { addLayer, canvasWidth, canvasHeight } = useCanvasStore()
  const url = result.backgroundUrl ?? result.signedUrl
  if (!url) return null

  const handleAddToCanvas = () => {
    addLayer({
      type: 'image',
      name: 'background',
      src: url,
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
  }

  return (
    <button
      onClick={handleAddToCanvas}
      className="ml-2 relative w-10 h-10 rounded overflow-hidden ring-1 ring-[#27272A] hover:ring-[#E8D5B0] transition-all flex-shrink-0"
      title="Click to add to canvas"
    >
      <img src={url} alt="Generated" className="w-full h-full object-cover" />
    </button>
  )
}
