import { db } from '@/db'
import { shareLinks, canvasStates } from '@/db/schema'
import { eq, and, gt } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import ShareViewer from '@/components/share/ShareViewer'

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [link] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.id, id), gt(shareLinks.expiresAt, new Date())))
    .limit(1)

  if (!link) notFound()

  const [canvasState] = await db
    .select()
    .from(canvasStates)
    .where(eq(canvasStates.sessionId, link.sessionId))
    .limit(1)

  return <ShareViewer stateJson={canvasState?.stateJson ?? null} />
}
