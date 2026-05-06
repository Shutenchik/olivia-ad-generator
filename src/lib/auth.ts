import { auth } from '@clerk/nextjs/server'

export async function requireAuth(): Promise<string> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('UNAUTHORIZED')
  }
  return userId
}

export function unauthorizedResponse(): Response {
  return new Response('Unauthorized', { status: 401 })
}
