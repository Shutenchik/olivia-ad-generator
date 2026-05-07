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

const SYSTEM_PROMPT = `You are an AI creative director for product ads. Users attach a product image and send a prompt only when they click Send — never assume upload alone triggered you.

When you receive a user message with product context (image in the message or CURRENT ASSET in system context):
1. Call detectProductType first using the current assetId from context.
2. Call generateCopy with productType from step 1, tone inferred from the user's words (default "premium minimal"), platform "instagram".
3. Call generateBackground once: choose aspectRatio "1:1" unless the user asked for a story or widescreen format; pick one scene prompt that best matches the user's request combined with the detected product; use productAssetId from CURRENT ASSET.

If image generation tools fail or are unavailable, continue with steps 1–2 only and explain briefly.

After tools finish, reply in plain English only. Use exactly these section labels as plain lines (no Markdown, no **, no #, no links, no ![ ] images):
Suggested background:
(one line describing the scene)

Ad concept:
(one short paragraph)

Headline:
(one punchy line from generateCopy when available, else invent)

Visual direction:
(lighting, palette, mood in one short paragraph)

Then one line: Next ideas: followed by a numbered list of four short prompts for follow-up (plain numbers like 1. 2. 3. 4.).

RULES:
- Never output raw image URLs or Markdown images; tool results render in the UI separately.
- generateBackground returns only an empty scene (no product). The editor draws it behind the user's uploaded product layer automatically; the product photo does not get replaced — it stays on top unless the user edits layers manually.
- Be concise; sections stay short.
- For follow-up messages without a new image, use currentAssetId from context for tools that need it.
- removeBackground / inpaintBackground / addHeadline only when the user clearly asks.
- Never say you cannot see the image if CURRENT ASSET or image parts are present.
- Next ideas: four prompts in the same sophistication family as the user's request (if they asked Bond or noir luxury, keep follow-ups in that mood — avoid generic café unless it fits).`

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
