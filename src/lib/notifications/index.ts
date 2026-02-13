import { z } from 'zod'

export const NotificationDataSchema = z.object({
  pathname: z.string().optional(),
})
export type NotificationData = z.infer<typeof NotificationDataSchema>

const BaseNotificationSchema = z.object({
  data: NotificationDataSchema.optional(),
  tag: z.string().optional(),
  icon: z.string().optional(),

  userId: z.number(),
  type: z.enum(['ascent', 'user', 'moderate', 'test']),
})

export const NotificationSchema = z.intersection(
  BaseNotificationSchema,
  z.object({
    body: z.string().optional(),
    title: z.string().optional(),
  }),
)
export type Notification = z.infer<typeof NotificationSchema>

export const NotificationTranslatableSchema = z.object({
  de: z.string(),
  en: z.string(),
})
export type NotificationTranslatable = z.infer<typeof NotificationTranslatableSchema>

export const TranslatedNotificationSchema = z.intersection(
  BaseNotificationSchema,
  z.object({
    body: NotificationTranslatableSchema.optional(),
    title: NotificationTranslatableSchema.optional(),
  }),
)
export type TranslatedNotification = z.infer<typeof TranslatedNotificationSchema>
