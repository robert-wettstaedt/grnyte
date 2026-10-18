import { zql } from '$lib/zero/zero-schema.gen'
import { defineMutator } from '@rocicorp/zero'
import { endpointSchema, markFeedSeenSchema, markReadSchema, subscriptionSchema } from './dto'

const waitForServer = async () => {}

export const notificationsMutatorDefs = {
  notifications: {
    // The badge and the feed's watermark move at once; the server's rows replace these on sync.
    markFeedSeen: defineMutator(markFeedSeenSchema, async ({ args, tx }) => {
      if (args.userId == null) return
      const settings = await tx.run(zql.userSettings.where('userFk', args.userId).one())
      if (settings != null && (settings.seenUpToEventAt ?? 0) < args.seenAt) {
        await tx.mutate.userSettings.update({ id: settings.id, seenUpToEventAt: args.seenAt })
      }
    }),
    markRead: defineMutator(markReadSchema, async ({ args, tx }) => {
      if (args.userId == null) return
      const unread = await tx.run(zql.notifications.where('userFk', args.userId).where('readAt', 'IS', null))
      const readAt = Date.now()
      for (const row of unread) {
        await tx.mutate.notifications.update({ id: row.id, readAt })
      }
    }),
    subscribePush: defineMutator(subscriptionSchema, waitForServer),
    unsubscribePush: defineMutator(endpointSchema, waitForServer),
  },
}
