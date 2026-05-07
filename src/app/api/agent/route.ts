import { auth } from '@clerk/nextjs/server'
import { streamText, stepCountIs, type ModelMessage } from 'ai'
import { z } from 'zod'

export const maxDuration = 60

const isDbConfigured = !!process.env.DATABASE_URL
const isRateLimitConfigured = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
const isOpenAiConfigured = !!process.env.OPENAI_API_KEY

const messagePart = z.object({
  type: z.string(),
  text: z.string().optional(),
}).passthrough()

const bodySchema = z.object({
  sessionId: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'tool', 'system']),
      content: z.union([z.string(), z.array(z.unknown())]).optional(),
      parts: z.array(messagePart).optional(),
      id: z.string().optional(),
    }).passthrough(),
  ),
  currentAssetId: z.string().nullable().optional(),
  currentAssetUrl: z.string().nullable().optional(),
  currentAssetBase64: z.string().nullable().optional(),
  currentAssetMimeType: z.string().nullable().optional(),
  trigger: z.string().optional(),
  id: z.string().optional(),
})

const SYSTEM_PROMPT = `You are an AI creative director that turns product photos into stunning ads.

WORKFLOW — follow this exactly:
1. When the user uploads an image or says they want to analyze it: call detectProductType immediately.
2. After detectProductType returns: pick the BEST of the 4 suggested prompts and call generateBackground right away (use aspectRatio "1:1" by default). Do NOT ask the user first.
3. After generateBackground returns: show the result and list all 4 suggested prompts as clickable options for the user to try next.
4. For follow-up requests like "make it warmer", "add headline", "try outdoor": call the appropriate tool immediately without asking.

RULES:
- Never say "I'll try" or "let me attempt" — just call the tool.
- Never ask for clarification unless the request is completely ambiguous (no product image at all).
- Always use the assetId from the system context when tools require it.
- Be concise: one short sentence max before/after tool calls.
- Prefer generateBackground for new scenes, inpaintBackground for modifications.
- For "remove background" requests: call removeBackground.
- For "add text/headline" requests: call addHeadline.`

export async function POST(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  if (isRateLimitConfigured) {
    const { agentRatelimit, rateLimitExceededResponse } = await import('@/lib/ratelimit')
    const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
    const { success, reset } = await agentRatelimit.limit(`${userId}:${ip}`)
    if (!success) return rateLimitExceededResponse(reset)
  }

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(JSON.stringify(parsed.error), { status: 400 })
  }

  const { sessionId, messages: rawMessages, currentAssetId, currentAssetUrl, currentAssetBase64, currentAssetMimeType } = parsed.data

  const incomingMessages = rawMessages.map((msg) => {
    if (msg.content !== undefined) return msg

    const parts = (msg.parts ?? []) as Record<string, unknown>[]

    const hasImage = parts.some((p) => p.type === 'image')

    if (hasImage) {
      const content = parts
        .filter((p) => p.type === 'text' || p.type === 'image')
        .map((p) => {
          if (p.type === 'text') return { type: 'text', text: p.text as string }
          return {
            type: 'image',
            image: p.image as string,
            mimeType: p.mimeType as string | undefined,
          }
        })
      return { role: msg.role, content }
    }

    const textPart = parts.find((p) => p.type === 'text')
    return {
      role: msg.role,
      content: typeof textPart?.text === 'string' ? textPart.text : '',
    }
  })

  if (isDbConfigured) {
    const { db } = await import('@/db')
    const { sessions } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
    if (!session) return new Response('Session not found', { status: 404 })

    const { checkSessionCost, SessionCostCapError } = await import('@/lib/costGuard')
    try {
      await checkSessionCost(sessionId)
    } catch (err) {
      if (err instanceof SessionCostCapError) {
        return new Response(
          JSON.stringify({ error: 'Session cost cap reached ($1.00). Start a new session to continue.' }),
          { status: 402, headers: { 'Content-Type': 'application/json' } },
        )
      }
      throw err
    }
  }

  if (!isOpenAiConfigured) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'AI agent is not configured. Add OPENAI_API_KEY to .env.local to enable.',
          ),
        )
        controller.close()
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  const { openai } = await import('@ai-sdk/openai')
  const { buildAgentTools } = await import('@/lib/agent/tools')
  const tools = buildAgentTools(sessionId, currentAssetUrl, currentAssetBase64, currentAssetMimeType)

  const systemPrompt = currentAssetId
    ? `${SYSTEM_PROMPT}\n\nCURRENT ASSET: The user has already uploaded a product image.\n- Asset ID: ${currentAssetId}\n- Image URL: ${currentAssetUrl ?? 'not available'}\nYou MUST use this assetId when calling tools that require assetId. Do NOT ask the user to upload an image — it is already loaded.`
    : SYSTEM_PROMPT

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: systemPrompt,
    messages: incomingMessages as ModelMessage[],
    tools,
    stopWhen: stepCountIs(10),
    onFinish: async ({ usage }) => {
      if (!isDbConfigured) return
      const { db } = await import('@/db')
      const { messages } = await import('@/db/schema')

      const lastMessage = incomingMessages[incomingMessages.length - 1]
      if (lastMessage?.role === 'user' && typeof lastMessage.content === 'string') {
        await db.insert(messages).values({ sessionId, role: 'user', content: lastMessage.content })
      }

      const inputCost = ((usage.inputTokens ?? 0) / 1_000_000) * 2.5
      const outputCost = ((usage.outputTokens ?? 0) / 1_000_000) * 10
      const totalCost = inputCost + outputCost

      await db.insert(messages).values({
        sessionId,
        role: 'assistant',
        content: `[tokens: ${(usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)}, cost: $${totalCost.toFixed(6)}]`,
      })
    },
  })

  return result.toTextStreamResponse()
}
