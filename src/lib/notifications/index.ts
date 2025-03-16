import { z } from 'zod'

export const NotificationDataSchema = z.object({
  pathname: z.string().optional(),
})
export type NotificationData = z.infer<typeof NotificationDataSchema>

export const NotificationSchema = z.object({
  body: z.string().optional(),
  data: NotificationDataSchema.optional(),
  icon: z.string().optional(),
  tag: z.string().optional(),
  title: z.string(),

  userId: z.number(),
  type: z.enum(['ascent', 'user', 'moderate']),
})
export type Notification = z.infer<typeof NotificationSchema>
