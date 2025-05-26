import { z } from 'zod/v4'

export const FileStatusResponseSchema = z.object({
  status: z.number(),
  title: z.string(),
  message: z.string(),
})
export type FileStatusResponse = z.infer<typeof FileStatusResponseSchema>
