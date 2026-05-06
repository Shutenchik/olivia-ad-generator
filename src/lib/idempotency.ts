import crypto from 'crypto'
import { db } from '@/db'
import { generations } from '@/db/schema'
import { eq } from 'drizzle-orm'

export function generateIdempotencyKey(
  sessionId: string,
  tool: string,
  prompt: string,
): string {
  return crypto
    .createHash('sha256')
    .update(`${sessionId}:${tool}:${prompt}`)
    .digest('hex')
}

export function generatePromptHash(prompt: string): string {
  return crypto.createHash('sha256').update(prompt).digest('hex')
}

export async function checkIdempotency(idempotencyKey: string) {
  const [existing] = await db
    .select()
    .from(generations)
    .where(eq(generations.idempotencyKey, idempotencyKey))
    .limit(1)

  if (!existing || existing.status !== 'done') return null
  return existing
}
