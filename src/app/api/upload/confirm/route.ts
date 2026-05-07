import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'

const bodySchema = z.object({
  assetId: z.string(),
  r2Key: z.string().optional(),
  mimeType: z.string().optional(),
})

const isDbConfigured = !!process.env.DATABASE_URL
const isR2Configured = !!(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME
)
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? null

function buildPublicUrl(r2Key: string): string | null {
  if (!R2_PUBLIC_URL) return null
  return `${R2_PUBLIC_URL}/${r2Key}`
}

export async function POST(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(JSON.stringify(parsed.error), { status: 400 })
  }

  const { assetId, r2Key, mimeType } = parsed.data
  const key = r2Key ?? assetId
  const publicUrl = buildPublicUrl(key)

  if (!isR2Configured || !isDbConfigured) {
    return Response.json({ assetId, signedUrl: publicUrl })
  }

  try {
    const { db } = await import('@/db')
    const { assets } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')

    const assetUrl = publicUrl ?? (await (await import('@/lib/r2')).generatePresignedDownloadUrl(key))

    await db
      .update(assets)
      .set({
        r2SignedUrl: assetUrl,
        signedUrlExpiresAt: publicUrl ? null : new Date(Date.now() + 3600 * 1000),
        ...(mimeType ? { mimeType } : {}),
      })
      .where(eq(assets.id, assetId))

    return Response.json({ assetId, signedUrl: assetUrl })
  } catch {
    return Response.json({ assetId, signedUrl: publicUrl })
  }
}
