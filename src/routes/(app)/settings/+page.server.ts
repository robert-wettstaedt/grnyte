import { PRIVATE_VAPID_KEY } from '$env/static/private'
import { PUBLIC_TOPO_EMAIL, PUBLIC_VAPID_KEY } from '$env/static/public'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { pushSubscriptions } from '$lib/db/schema'
import { convertException } from '$lib/errors.js'
import { fail } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import webpush from 'web-push'

webpush.setVapidDetails(`mailto:${PUBLIC_TOPO_EMAIL}`, PUBLIC_VAPID_KEY, PRIVATE_VAPID_KEY)

export const actions = {
  subscribe: async ({ locals, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    return await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      const formData = await request.formData()
      const subscription = formData.get('subscription')

      if (typeof subscription !== 'string') {
        return fail(400)
      }

      try {
        const subscriptionObject = JSON.parse(subscription)

        const [result] = await db
          .insert(pushSubscriptions)
          .values({
            authUserFk: locals.user.authUserFk,
            userFk: locals.user.id,
            ...subscriptionObject,
          })
          .returning({ id: pushSubscriptions.id })

        return { subscriptionId: result.id }
      } catch (exception) {
        return fail(400, { error: convertException(exception) })
      }
    })
  },

  unsubscribe: async ({ locals, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    return await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      const formData = await request.formData()
      const pushSubscriptionId = formData.get('pushSubscriptionId')
      const pushSubscriptionIdNum = Number(pushSubscriptionId)

      if (pushSubscriptionId == null || Number.isNaN(pushSubscriptionIdNum)) {
        return fail(400)
      }

      await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.id, pushSubscriptionIdNum),
            eq(pushSubscriptions.authUserFk, locals.user.authUserFk),
          ),
        )
    })
  },

  test: async ({ locals }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    return await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      const results = await db.query.pushSubscriptions.findMany({
        where: eq(pushSubscriptions.authUserFk, locals.user.authUserFk),
      })

      await Promise.all(
        results.map(({ endpoint, expirationTime, auth, p256dh }) =>
          webpush.sendNotification(
            { endpoint, keys: { auth, p256dh }, expirationTime },
            JSON.stringify({
              title: 'Crag Track Notification',
              body: 'This is a test notification',
              icon: '/android-chrome-192x192.png',
            }),
          ),
        ),
      )
    })
  },
}
