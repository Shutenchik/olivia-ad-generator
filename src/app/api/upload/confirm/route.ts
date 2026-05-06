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

export async function POST(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(JSON.stringify(parsed.error), { status: 400 })
  }

  const { assetId, r2Key, mimeType } = parsed.data

  if (!isR2Configured || !isDbConfigured) {
    return Response.json({ assetId, signedUrl: null })
  }

  try {
    const { db } = await import('@/db')
    const { assets } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')
    const { generatePresignedDownloadUrl } = await import('@/lib/r2')

    const key = r2Key ?? assetId
    const signedUrl = await generatePresignedDownloadUrl(key)
    const expiresAt = new Date(Date.now() + 3600 * 1000)

    await db
      .update(assets)
      .set({
        r2SignedUrl: signedUrl,
        signedUrlExpiresAt: expiresAt,
        ...(mimeType ? { mimeType } : {}),
      })
      .where(eq(assets.id, assetId))

    return Response.json({ assetId, signedUrl })
  } catch {
    return Response.json({ assetId, signedUrl: null })
  }
}
