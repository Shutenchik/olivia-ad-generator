import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    limit: vi.fn().mockResolvedValue([]),
  },
}))

import { generateIdempotencyKey, generatePromptHash } from '@/lib/idempotency'

describe('generateIdempotencyKey', () => {
  it('returns a 64-char hex string', () => {
    const key = generateIdempotencyKey('session-1', 'generateBackground', 'blue sky')
    expect(key).toHaveLength(64)
    expect(key).toMatch(/^[0-9a-f]+$/)
  })

  it('is deterministic — same inputs produce same key', () => {
    const a = generateIdempotencyKey('s1', 'tool', 'prompt')
    const b = generateIdempotencyKey('s1', 'tool', 'prompt')
    expect(a).toBe(b)
  })

  it('produces different keys for different inputs', () => {
    const a = generateIdempotencyKey('s1', 'tool', 'prompt-A')
    const b = generateIdempotencyKey('s1', 'tool', 'prompt-B')
    expect(a).not.toBe(b)
  })

  it('differentiates by sessionId', () => {
    const a = generateIdempotencyKey('session-A', 'tool', 'prompt')
    const b = generateIdempotencyKey('session-B', 'tool', 'prompt')
    expect(a).not.toBe(b)
  })
})

describe('generatePromptHash', () => {
  it('returns consistent SHA256 for same prompt', () => {
    expect(generatePromptHash('hello')).toBe(generatePromptHash('hello'))
  })

  it('returns different hash for different prompts', () => {
    expect(generatePromptHash('hello')).not.toBe(generatePromptHash('world'))
  })
})
