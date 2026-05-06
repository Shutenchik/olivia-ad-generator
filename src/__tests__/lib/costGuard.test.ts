import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SessionCostCapError } from '@/lib/costGuard'

vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  },
}))

import { checkSessionCost } from '@/lib/costGuard'
import { db } from '@/db'

describe('checkSessionCost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SESSION_COST_CAP_USD = '1.00'
  })

  it('does not throw when cost is under cap', async () => {
    const mockDb = db as unknown as {
      select: ReturnType<typeof vi.fn>
      from: ReturnType<typeof vi.fn>
      where: ReturnType<typeof vi.fn>
    }
    mockDb.where.mockResolvedValueOnce([{ total: '0.50' }])
    await expect(checkSessionCost('session-1')).resolves.not.toThrow()
  })

  it('throws SessionCostCapError when cost equals cap', async () => {
    const mockDb = db as unknown as {
      select: ReturnType<typeof vi.fn>
      from: ReturnType<typeof vi.fn>
      where: ReturnType<typeof vi.fn>
    }
    mockDb.where.mockResolvedValueOnce([{ total: '1.00' }])
    await expect(checkSessionCost('session-1')).rejects.toThrow(SessionCostCapError)
  })

  it('throws SessionCostCapError when cost exceeds cap', async () => {
    const mockDb = db as unknown as {
      select: ReturnType<typeof vi.fn>
      from: ReturnType<typeof vi.fn>
      where: ReturnType<typeof vi.fn>
    }
    mockDb.where.mockResolvedValueOnce([{ total: '1.50' }])
    await expect(checkSessionCost('session-1')).rejects.toThrow(SessionCostCapError)
  })

  it('does not throw when cost is null (no generations)', async () => {
    const mockDb = db as unknown as {
      select: ReturnType<typeof vi.fn>
      from: ReturnType<typeof vi.fn>
      where: ReturnType<typeof vi.fn>
    }
    mockDb.where.mockResolvedValueOnce([{ total: null }])
    await expect(checkSessionCost('session-1')).resolves.not.toThrow()
  })
})
