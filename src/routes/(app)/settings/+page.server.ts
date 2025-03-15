import { PRIVATE_VAPID_KEY } from '$env/static/private'
import { PUBLIC_TOPO_EMAIL, PUBLIC_VAPID_KEY } from '$env/static/public'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { pushSubscriptions, userSettings } from '$lib/db/schema'
import { convertException } from '$lib/errors.js'
import {
  notificationsActionSchema,
  pushSubscriptionSchema,
  subscribePushSubscriptionActionSchema,
  unsubscribePushSubscriptionActionSchema,
  validateFormData,
  validateObject,
  type ActionFailure,
  type NotificationsActionValues,
  type PushSubscription,
  type SubscribePushSubscriptionActionValues,
  type UnsubscribePushSubscriptionActionValues,
} from '$lib/forms.server'
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

      // Retrieve form data from the request
      const data = await request.formData()
      let values: SubscribePushSubscriptionActionValues
      let subscription: PushSubscription

      try {
        // Validate the form data
        values = await validateFormData(subscribePushSubscriptionActionSchema, data)
        subscription = await validateObject(pushSubscriptionSchema, JSON.parse(values.subscription))
      } catch (exception) {
        // If validation fails, return the exception as BlockActionFailure
        return exception as ActionFailure<SubscribePushSubscriptionActionValues>
      }

      try {
        if (values.pushSubscriptionId != null) {
          await db
            .delete(pushSubscriptions)
            .where(
              and(
                eq(pushSubscriptions.id, values.pushSubscriptionId),
                eq(pushSubscriptions.authUserFk, locals.user.authUserFk),
              ),
            )
        }

        const [result] = await db
          .insert(pushSubscriptions)
          .values({
            authUserFk: locals.user.authUserFk,
            userFk: locals.user.id,
            ...subscription,
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

      // Retrieve form data from the request
      const data = await request.formData()
      let values: UnsubscribePushSubscriptionActionValues

      try {
        // Validate the form data
        values = await validateFormData(unsubscribePushSubscriptionActionSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as BlockActionFailure
        return exception as ActionFailure<UnsubscribePushSubscriptionActionValues>
      }

      await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.id, values.pushSubscriptionId),
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

  notifications: async ({ locals, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    return await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      const data = await request.formData()
      let values: NotificationsActionValues

      try {
        // Validate the form data
        values = await validateFormData(notificationsActionSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as BlockActionFailure
        return exception as ActionFailure<NotificationsActionValues>
      }

      const [result] = await db
        .update(userSettings)
        .set({
          notifyNewUsers: values.notifyNewUsers === 'on',
          notifyNewAscents: values.notifyNewAscents === 'on',
        })
        .where(eq(userSettings.authUserFk, locals.user.authUserFk))
        .returning({
          notifyNewUsers: userSettings.notifyNewUsers,
          notifyNewAscents: userSettings.notifyNewAscents,
        })

      return result
    })
  },
}
