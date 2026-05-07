import { auth } from '@clerk/nextjs/server'
import { fal } from '@fal-ai/client'
import { z } from 'zod'

export const maxDuration = 60

const isFalConfigured = !!process.env.FAL_KEY
if (isFalConfigured) {
  fal.config({ credentials: process.env.FAL_KEY })
}

const bodySchema = z.object({
  prompt: z.string().min(2).max(400),
  aspectRatio: z.enum(['1:1', '4:5', '9:16', '16:9']).default('1:1'),
})

const imageSizeMap = {
  '1:1': 'square_hd',
  '4:5': 'portrait_4_3',
  '9:16': 'portrait_16_9',
  '16:9': 'landscape_16_9',
} as const

interface FalImageResult {
  images?: { url: string }[]
}

export async function POST(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  if (!isFalConfigured) {
    return new Response(JSON.stringify({ error: 'fal.ai is not configured' }), { status: 500 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid input' }), { status: 400 })
  }

  const { prompt, aspectRatio } = parsed.data
  const enhancedPrompt = `Professional product advertisement background: ${prompt}. Clean, high-end commercial photography style. No products, no people — empty scene only.`

  try {
    const result = await fal.subscribe('fal-ai/flux/schnell', {
      input: {
        prompt: enhancedPrompt,
        image_size: imageSizeMap[aspectRatio],
        num_inference_steps: 4,
        num_images: 1,
      },
    })

    const data = result.data as FalImageResult
    const imageUrl = data.images?.[0]?.url ?? ''
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'No image returned' }), { status: 502 })
    }

    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch generated image' }), { status: 502 })
    }
    const arrayBuffer = await imgRes.arrayBuffer()
    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const dataUrl = `data:${contentType};base64,${base64}`

    return Response.json({ imageUrl: dataUrl, sourceUrl: imageUrl, prompt, aspectRatio })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    console.error('[generate-background] fal.ai error:', err)
    return new Response(JSON.stringify({ error: message }), { status: 502 })
  }
}
