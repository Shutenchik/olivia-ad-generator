import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export const agentRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 h'),
  prefix: 'ratelimit:agent',
})

export const exportRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, '1 h'),
  prefix: 'ratelimit:export',
})

export function rateLimitExceededResponse(reset: number): Response {
  return new Response('Too Many Requests', {
    status: 429,
    headers: {
      'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
      'X-RateLimit-Limit': '20',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(reset),
    },
  })
}
