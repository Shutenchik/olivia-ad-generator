import { auth } from '@clerk/nextjs/server'
import { fal } from '@fal-ai/client'
import { z } from 'zod'

export const maxDuration = 60

const isFalConfigured = !!process.env.FAL_KEY
if (isFalConfigured) {
  fal.config({ credentials: process.env.FAL_KEY })
}

const bodySchema = z.object({
  image: z.string().min(10),
})

interface FalImageResult {
  image?: { url: string }
  images?: { url: string }[]
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  if (!header || !base64) throw new Error('Invalid data URL')
  const mimeMatch = /data:([^;]+)/.exec(header)
  const mime = mimeMatch?.[1] ?? 'image/png'
  const bytes = Buffer.from(base64, 'base64')
  return new Blob([bytes], { type: mime })
}

async function resolveImageUrl(image: string): Promise<string> {
  if (!image.startsWith('data:')) return image
  const blob = dataUrlToBlob(image)
  const file = new File([blob], 'product.png', { type: blob.type })
  const uploaded = await fal.storage.upload(file)
  return uploaded
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

  try {
    const sourceUrl = await resolveImageUrl(parsed.data.image)

    const result = await fal.subscribe('fal-ai/birefnet', {
      input: { image_url: sourceUrl },
    })

    const data = result.data as FalImageResult
    const cutoutUrl = data.image?.url ?? data.images?.[0]?.url ?? ''
    if (!cutoutUrl) {
      return new Response(JSON.stringify({ error: 'No cutout returned' }), { status: 502 })
    }

    const imgRes = await fetch(cutoutUrl)
    if (!imgRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch cutout' }), { status: 502 })
    }
    const arrayBuffer = await imgRes.arrayBuffer()
    const contentType = imgRes.headers.get('content-type') ?? 'image/png'
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const dataUrl = `data:${contentType};base64,${base64}`

    return Response.json({ imageUrl: dataUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cutout failed'
    console.error('[remove-background] error:', err)
    return new Response(JSON.stringify({ error: message }), { status: 502 })
  }
}
