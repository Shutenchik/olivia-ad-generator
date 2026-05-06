import { db } from '@/db'
import { generations } from '@/db/schema'
import { eq, sum } from 'drizzle-orm'

export class SessionCostCapError extends Error {
  constructor() {
    super('SESSION_COST_CAP_EXCEEDED')
    this.name = 'SessionCostCapError'
  }
}

export async function checkSessionCost(sessionId: string): Promise<void> {
  const cap = parseFloat(process.env.SESSION_COST_CAP_USD ?? '1.00')

  const [result] = await db
    .select({ total: sum(generations.costUsd) })
    .from(generations)
    .where(eq(generations.sessionId, sessionId))

  const total = parseFloat(result?.total ?? '0')

  if (total >= cap) {
    throw new SessionCostCapError()
  }
}
