import { auth } from '@clerk/nextjs/server'
import { db } from '@/db'
import { sessions } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function POST(): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const [session] = await db
    .insert(sessions)
    .values({ clerkUserId: userId })
    .returning({ id: sessions.id })

  return Response.json({ sessionId: session?.id })
}

export async function GET(): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const [latest] = await db
    .select({ id: sessions.id, createdAt: sessions.createdAt })
    .from(sessions)
    .where(eq(sessions.clerkUserId, userId))
    .orderBy(desc(sessions.createdAt))
    .limit(1)

  return Response.json({ session: latest ?? null })
}
