import { applyRls } from '$lib/db/db.server'
import { asCaller, asPrivileged, defineServerMutator } from '$lib/zero/serverMutator.server'
import { endpointSchema, markFeedSeenSchema, markReadSchema, subscriptionSchema } from './dto'
import {
  markEventFeedSeenRow,
  markNotificationsReadRow,
  subscribeToPushRow,
  unsubscribeFromPushRow,
} from './inbox.server'

export const notificationsServerMutatorDefs = {
  notifications: {
    markFeedSeen: defineServerMutator(markFeedSeenSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => markEventFeedSeenRow(args, { db, user: ctx.user }))
    }),
    markRead: defineServerMutator(markReadSchema, async ({ ctx, tx }) => {
      await asCaller(tx, ctx, (db) => markNotificationsReadRow({ db, user: ctx.user }))
    }),
    subscribePush: defineServerMutator(subscriptionSchema, async ({ args, ctx, tx }) => {
      await asPrivileged(tx, (db) =>
        subscribeToPushRow(args, { db, dropToCaller: () => applyRls(db, ctx.claims), user: ctx.user }),
      )
    }),
    unsubscribePush: defineServerMutator(endpointSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => unsubscribeFromPushRow(args, { db, user: ctx.user }))
    }),
  },
}
