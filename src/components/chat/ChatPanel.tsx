'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import { TextStreamChatTransport, isTextUIPart, isToolUIPart } from 'ai'
import { Send, Square, Bot, DollarSign, X, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCanvasStore } from '@/store/canvas'
import { cn } from '@/lib/utils'
import type { TextLayer } from '@/types/canvas'
import type { ChatDraftAttachment } from '@/types/chat'
import { SAMPLE_CREATIVE_PROMPT } from '@/lib/chat/samplePrompt'
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
  attachment?: ChatDraftAttachment | null
  onClearAttachment?: () => void
  uploadInProgress?: boolean
  onSuggestedPrompt?: (prompt: string) => void
}

const MD_IMAGE_RE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g

function segmentAssistantMarkdown(
  text: string,
): Array<{ type: 'text' | 'image'; value: string }> {
  const segments: Array<{ type: 'text' | 'image'; value: string }> = []
  let cursor = 0
  MD_IMAGE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MD_IMAGE_RE.exec(text)) !== null) {
    const before = text.slice(cursor, match.index).trim()
    if (before.length > 0) segments.push({ type: 'text', value: before })
    const url = match[2]?.trim()
    if (url?.length) segments.push({ type: 'image', value: url })
    cursor = match.index + match[0].length
  }
  const tail = text.slice(cursor).trim()
  if (tail.length > 0) segments.push({ type: 'text', value: tail })
  return segments
}

function lightenAssistantMarkup(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^\s*(https:\/\/(?:[\w.]+\.)?fal\.(?:media|run)\/\S+)\s*$/gim, '')
    .trim()
}

function AssistantMessageBody({ rawText }: { rawText: string }) {
  const light = lightenAssistantMarkup(rawText)
  const chunks = segmentAssistantMarkdown(light)

  if (chunks.length === 0) return null

  if (chunks.length === 1) {
    const only = chunks[0]
    if (only?.type === 'text') {
      return <AssistantTextParagraphs text={only.value} />
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {chunks.map((chunk, i) =>
        chunk.type === 'image' ? (
          <AssistantImagePreview key={`img-${chunk.value}-${String(i)}`} url={chunk.value} />
        ) : (
          <AssistantTextParagraphs key={`txt-${String(i)}`} text={chunk.value} />
        ),
      )}
    </div>
  )
}

function AssistantTextParagraphs({ text }: { text: string }) {
  const trimmed = text.trim()
  if (trimmed.length === 0) return null

  const blocks = trimmed.split(/\n\n+/)

  return (
    <>
      {blocks.map((block, idx) => {
        const lines = block.split('\n')
        const isList = lines.every((l) => !l.trim() || /^\d+\.\s+/.test(l.trim()))

        if (isList && lines.some((l) => /^\d+\.\s+/.test(l.trim()))) {
          return (
            <ol
              key={`ol-${String(idx)}`}
              className="list-decimal list-inside space-y-1.5 mb-2 last:mb-0 text-[#FAFAF9]"
            >
              {lines
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => line.replace(/^\d+\.\s*/, ''))
                .map((content, lineIdx) => (
                  <li
                    key={`li-${String(idx)}-${String(lineIdx)}`}
                    className="leading-snug marker:text-[#E8D5B0]"
                  >
                    {content}
                  </li>
                ))}
            </ol>
          )
        }

        return (
          <p
            key={`p-${String(idx)}`}
            className="leading-relaxed whitespace-pre-wrap mb-2 last:mb-0 text-[#FAFAF9]"
          >
            {block}
          </p>
        )
      })}
    </>
  )
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

interface PendingPart {
  type: string
  text?: string
  image?: string
  mimeType?: string
}

export default function ChatPanel({
  sessionId,
  attachment,
  onClearAttachment,
  uploadInProgress,
  onSuggestedPrompt,
}: ChatPanelProps) {
  const addLayer = useCanvasStore((s) => s.addLayer)
  const layers = useCanvasStore((s) => s.layers)
  const canvasWidth = useCanvasStore((s) => s.canvasWidth)
  const canvasHeight = useCanvasStore((s) => s.canvasHeight)
  const currentAssetId = useCanvasStore((s) => s.currentAssetId)
  const currentAssetUrl = useCanvasStore((s) => s.currentAssetUrl)
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

  useEffect(() => {
    currentAssetIdRef.current = currentAssetId ?? null
  }, [currentAssetId])
  useEffect(() => {
    currentAssetUrlRef.current = currentAssetUrl ?? null
  }, [currentAssetUrl])

  useEffect(() => {
    if (!attachment) return
    currentAssetIdRef.current = attachment.assetId
    currentAssetUrlRef.current = attachment.url
    currentAssetBase64Ref.current = attachment.base64 ?? null
    currentAssetMimeTypeRef.current = attachment.mimeType
  }, [attachment])

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

  const syncGeneratedBackgroundToCanvas = useCallback(
    (imageUrl: string) => {
      const store = useCanvasStore.getState()
      const toRemove = store.layers.filter(
        (l) => l.type === 'image' && l.name === 'background',
      )
      toRemove.forEach((l) => store.removeLayer(l.id))
      store.addLayer({
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
    },
    [canvasWidth, canvasHeight],
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

      const headlineMatch = textContent.match(/Headline:\s*\n?(.+)/i)
      if (headlineMatch?.[1]) {
        const headlineText = headlineMatch[1].trim().toUpperCase()
        const store = useCanvasStore.getState()
        const existingHeadline = store.layers.find(
          (l) => l.type === 'text' && l.name === 'headline',
        )
        if (existingHeadline) {
          store.updateLayer(existingHeadline.id, { text: headlineText })
        } else {
          addLayer({
            type: 'text',
            name: 'headline',
            text: headlineText,
            x: 0,
            y: canvasHeight * 0.88,
            fontFamily: 'DM Sans',
            fontSize: Math.round(canvasWidth * 0.04),
            fontWeight: '600',
            fill: '#FFFFFF',
            rotation: 0,
            width: canvasWidth,
            locked: false,
            visible: true,
          })
        }
        useCanvasStore.getState().pingResult()
      }

      for (const part of msg.parts) {
        if (!isToolUIPart(part)) continue
        const toolPart = part as unknown as {
          type: string
          state: string
          output?: ToolResult
        }
        const toolName = toolPart.type.replace(/^tool-/, '')
        if (toolPart.state !== 'output-available' || !toolPart.output) continue

        if (toolName === 'detectProductType' && toolPart.output.suggestedPrompts?.length) {
          setSuggestedPrompts(toolPart.output.suggestedPrompts)
        }

        if (toolName === 'generateBackground') {
          const url = toolPart.output.backgroundUrl ?? ''
          if (url.length > 0) {
            syncGeneratedBackgroundToCanvas(url)
            useCanvasStore.getState().pingResult()
          }
        }

        if (
          (toolName === 'inpaintBackground' || toolName === 'removeBackground') &&
          toolPart.output.signedUrl
        ) {
          syncGeneratedBackgroundToCanvas(toolPart.output.signedUrl)
          useCanvasStore.getState().pingResult()
        }
      }
    },
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const canSend = !isLoading && !uploadInProgress && (inputValue.trim().length > 0 || !!attachment)

  const handleSend = () => {
    if (!canSend) return

    const text = inputValue.trim()
    const parts: PendingPart[] = []

    if (text.length > 0) {
      parts.push({ type: 'text', text })
    }

    if (attachment?.base64) {
      parts.push({
        type: 'image',
        image: attachment.base64,
        mimeType: attachment.mimeType,
      })
    }

    if (parts.length === 0) return

    sendMessage({ role: 'user', parts } as Parameters<typeof sendMessage>[0])

    setInputValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    if (attachment) onClearAttachment?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const sendSuggestion = (prompt: string) => {
    if (isLoading || uploadInProgress) return
    sendMessage({ role: 'user', parts: [{ type: 'text', text: prompt }] })
    setSuggestedPrompts([])
    onSuggestedPrompt?.(prompt)
  }

  const placeholder = attachment
    ? 'Type your creative brief, tap Sample prompt, or send with image only…'
    : (PLACEHOLDER_PROMPTS[placeholderIndex] ?? '')

  return (
    <div className="flex flex-col h-full bg-[#111113]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272A]">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-[#E8D5B0]" />
          <span className="text-sm font-medium text-[#FAFAF9]">AI Director</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-[#27272A] text-[#71717A] font-mono">
            gpt-4o-mini
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
              <p className="text-sm text-[#71717A] max-w-[260px] leading-relaxed">
                Need creative direction? Ask AI Director for ad concepts, headlines, or scene ideas.
                For instant background swaps use the Generate panel on the left.
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
                    const t = part.text ?? ''
                    if (message.role === 'assistant') {
                      return <AssistantMessageBody key={i} rawText={t} />
                    }
                    return (
                      <p key={i} className="leading-relaxed whitespace-pre-wrap">
                        {t}
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
                    const imageUrl =
                      toolPart.output?.backgroundUrl ?? toolPart.output?.signedUrl ?? ''
                    const showImagePreview =
                      isDone &&
                      imageUrl.length > 0 &&
                      (toolName === 'generateBackground' ||
                        toolName === 'inpaintBackground' ||
                        toolName === 'removeBackground')

                    return (
                      <div
                        key={i}
                        className={cn(
                          'py-2 px-2 rounded bg-[#27272A]/50 my-1',
                          showImagePreview ? 'flex flex-col gap-2' : 'flex items-center gap-2',
                        )}
                      >
                        <div className="flex items-center gap-2 min-h-[1.5rem]">
                          <span className="text-xs text-[#71717A] font-mono">{toolName}</span>
                          {isRunning && (
                            <div className="w-3 h-3 border border-[#E8D5B0] border-t-transparent rounded-full animate-spin" />
                          )}
                          {isDone && <span className="text-xs text-[#4ADE80]">✓</span>}
                        </div>
                        {showImagePreview && <AssistantImagePreview url={imageUrl} />}
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
              type="button"
              onClick={() => sendSuggestion(prompt)}
              className="text-xs px-2.5 py-1.5 rounded-full bg-[#1A1A1D] text-[#FAFAF9] border border-[#27272A] hover:border-[#E8D5B0]/50 hover:text-[#E8D5B0] transition-all duration-200"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              ✦ {prompt}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 py-3 border-t border-[#27272A] flex flex-col gap-2">
        {attachment && (
          <ChatAttachmentPreview
            attachment={attachment}
            onRemove={onClearAttachment ?? (() => undefined)}
          />
        )}

        {attachment && (
          <button
            type="button"
            onClick={() => setInputValue(SAMPLE_CREATIVE_PROMPT)}
            className="self-start text-xs px-2.5 py-1 rounded-md border border-[#3F3F46] text-[#A1A1AA] hover:border-[#E8D5B0]/50 hover:text-[#E8D5B0] transition-colors"
          >
            Sample prompt
          </button>
        )}

        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
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
              disabled={!canSend}
              className="h-9 w-9 flex-shrink-0 bg-[#E8D5B0] hover:bg-[#F5E6C8] text-[#0A0A0B]"
              onClick={handleSend}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        {uploadInProgress && (
          <p className="text-[11px] text-[#71717A]">Finishing upload before you can send…</p>
        )}
      </div>
    </div>
  )
}

interface ChatAttachmentPreviewProps {
  attachment: ChatDraftAttachment
  onRemove: () => void
}

function ChatAttachmentPreview({ attachment, onRemove }: ChatAttachmentPreviewProps) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-[#1A1A1D] border border-[#27272A]">
      <div className="w-9 h-9 rounded overflow-hidden bg-[#0A0A0B] flex items-center justify-center flex-shrink-0">
        {attachment.url ? (
          <img src={attachment.url} alt="" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-4 h-4 text-[#71717A]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[#FAFAF9] truncate">{attachment.name ?? 'product image'}</p>
        <p className="text-[10px] text-[#71717A]">Attached · not sent yet</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-1 rounded text-[#A1A1AA] hover:text-[#F87171] hover:bg-[#F87171]/10 transition-colors"
        aria-label="Remove attachment"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function AssistantImagePreview({ url }: { url: string }) {
  const addLayer = useCanvasStore((s) => s.addLayer)
  const canvasWidth = useCanvasStore((s) => s.canvasWidth)
  const canvasHeight = useCanvasStore((s) => s.canvasHeight)

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
      type="button"
      onClick={handleAddToCanvas}
      className="group w-full max-w-[260px] rounded-lg overflow-hidden ring-1 ring-[#3F3F46] hover:ring-[#E8D5B0]/60 transition-all text-left"
      title="Add to canvas"
    >
      <img
        src={url}
        alt=""
        className="w-full max-h-[220px] object-cover block bg-[#0A0A0B]"
      />
      <div className="px-2 py-1.5 bg-[#18181B] text-[11px] text-[#A1A1AA] group-hover:text-[#E8D5B0]">
        Tap to add to canvas
      </div>
    </button>
  )
}

