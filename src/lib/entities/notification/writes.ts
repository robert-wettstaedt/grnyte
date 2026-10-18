import type * as z from '$lib/forms/zod'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import type { subscriptionSchema } from './dto'

export const markNotificationsRead = (userId: number | undefined) => write(mutators.notifications.markRead({ userId }))

export const markEventFeedSeen = (seenAt: number, userId: number | undefined) =>
  write(mutators.notifications.markFeedSeen({ seenAt, userId }))

export const subscribeToPush = (subscription: z.input<typeof subscriptionSchema>) =>
  write(mutators.notifications.subscribePush(subscription))

export const unsubscribeFromPush = (endpoint: string) => write(mutators.notifications.unsubscribePush({ endpoint }))
