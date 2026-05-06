import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/db'
import { generations, assets, sessions } from '@/db/schema'
import { eq, desc, and } from 'drizzle-orm'
import { getSignedUrlForAsset } from '@/lib/r2'

const querySchema = z.object({
  sessionId: z.string().uuid(),
})

export async function GET(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({ sessionId: url.searchParams.get('sessionId') })
  if (!parsed.success) {
    return new Response(JSON.stringify(parsed.error), { status: 400 })
  }

  const { sessionId } = parsed.data

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.clerkUserId, userId)))
    .limit(1)

  if (!session) return new Response('Session not found', { status: 404 })

  const rows = await db
    .select({
      id: generations.id,
      prompt: generations.prompt,
      model: generations.model,
      tool: generations.tool,
      status: generations.status,
      costUsd: generations.costUsd,
      latencyMs: generations.latencyMs,
      createdAt: generations.createdAt,
      outputAssetId: generations.outputAssetId,
    })
    .from(generations)
    .where(eq(generations.sessionId, sessionId))
    .orderBy(desc(generations.createdAt))
    .limit(50)

  const enriched = await Promise.all(
    rows.map(async (row) => {
      const thumbnailUrl = row.outputAssetId
        ? await getSignedUrlForAsset(row.outputAssetId).catch(() => null)
        : null
      return { ...row, thumbnailUrl }
    }),
  )

  return Response.json({ generations: enriched })
}
