import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_SIZE_BYTES = 10_000_000

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  size: z.number().int().positive().max(MAX_SIZE_BYTES),
  sessionId: z.string().optional(),
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

  const { filename, contentType, size, sessionId: existingSessionId } = parsed.data
  const ext = filename.split('.').pop() ?? 'bin'
  const assetId = uuidv4()
  const sessionId = existingSessionId ?? uuidv4()
  const r2Key = `uploads/${sessionId}/${assetId}.${ext}`

  if (!isR2Configured) {
    return Response.json({
      uploadUrl: null,
      assetId,
      r2Key,
      sessionId,
      localMode: true,
    })
  }

  if (isDbConfigured) {
    const { db } = await import('@/db')
    const { sessions, assets } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')

    if (!existingSessionId) {
      await db.insert(sessions).values({ clerkUserId: userId }).returning({ id: sessions.id })
    } else {
      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, existingSessionId))
        .limit(1)
      if (!session) return new Response('Session not found', { status: 404 })
    }

    await db.insert(assets).values({ sessionId, r2Key, type: 'original', mimeType: contentType })
  }

  const { generatePresignedUploadUrl } = await import('@/lib/r2')
  const uploadUrl = await generatePresignedUploadUrl(r2Key, contentType, size)

  return Response.json({ uploadUrl, assetId, r2Key, sessionId })
}
