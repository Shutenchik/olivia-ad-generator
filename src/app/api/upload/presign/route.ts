import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/db'
import { assets, sessions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generatePresignedUploadUrl } from '@/lib/r2'

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_SIZE_BYTES = 10_000_000

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  size: z.number().int().positive().max(MAX_SIZE_BYTES),
  sessionId: z.string().uuid().optional(),
})

export async function POST(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(JSON.stringify(parsed.error), { status: 400 })
  }

  const { filename, contentType, size, sessionId: existingSessionId } = parsed.data

  let sessionId = existingSessionId
  if (!sessionId) {
    const [session] = await db
      .insert(sessions)
      .values({ clerkUserId: userId })
      .returning({ id: sessions.id })
    sessionId = session?.id
  } else {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, existingSessionId!))
      .limit(1)
    if (!session) return new Response('Session not found', { status: 404 })
  }

  if (!sessionId) return new Response('Failed to create session', { status: 500 })

  const ext = filename.split('.').pop() ?? 'bin'
  const r2Key = `uploads/${sessionId}/${uuidv4()}.${ext}`

  const uploadUrl = await generatePresignedUploadUrl(r2Key, contentType, size)

  const [asset] = await db
    .insert(assets)
    .values({
      sessionId,
      r2Key,
      type: 'original',
      mimeType: contentType,
    })
    .returning({ id: assets.id })

  return Response.json({ uploadUrl, assetId: asset?.id, r2Key, sessionId })
}
