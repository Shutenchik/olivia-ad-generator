import { auth } from '@clerk/nextjs/server'
import { v4 as uuidv4 } from 'uuid'

const isDatabaseConfigured = !!process.env.DATABASE_URL

async function getDb() {
  if (!isDatabaseConfigured) return null
  const { db } = await import('@/db')
  return db
}

export async function POST(): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  try {
    const db = await getDb()
    if (!db) {
      return Response.json({ sessionId: uuidv4() })
    }

    const { sessions } = await import('@/db/schema')
    const [session] = await db
      .insert(sessions)
      .values({ clerkUserId: userId })
      .returning({ id: sessions.id })

    return Response.json({ sessionId: session?.id ?? uuidv4() })
  } catch {
    return Response.json({ sessionId: uuidv4() })
  }
}

export async function GET(): Promise<Response> {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  try {
    const db = await getDb()
    if (!db) return Response.json({ session: null })

    const { sessions } = await import('@/db/schema')
    const { eq, desc } = await import('drizzle-orm')

    const [latest] = await db
      .select({ id: sessions.id, createdAt: sessions.createdAt })
      .from(sessions)
      .where(eq(sessions.clerkUserId, userId))
      .orderBy(desc(sessions.createdAt))
      .limit(1)

    return Response.json({ session: latest ?? null })
  } catch {
    return Response.json({ session: null })
  }
}
