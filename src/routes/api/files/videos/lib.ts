import { videoSchema } from '$lib/bunny'
import { z } from 'zod/v4'

export const CreateVideoResponseSchema = z.object({
  expirationTime: z.number(),
  signature: z.string(),
  video: videoSchema,
})
