import { createFalClient } from '@fal-ai/client'

export const fal = createFalClient({
  credentials: process.env.FAL_KEY,
})
