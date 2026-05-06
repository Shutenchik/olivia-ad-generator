import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/db'
import { shareLinks, sessions } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

const bodySchema = z.object({
  sessionId: z.string().uuid(),
})

export async function POST(req: Request): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
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

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const [link] = await db
    .insert(shareLinks)
    .values({ sessionId, expiresAt })
    .returning({ id: shareLinks.id })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return Response.json({ shareUrl: `${appUrl}/share/${link?.id}` })
}
