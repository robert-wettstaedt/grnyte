import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { areas, pushSubscriptions, users, userSettings } from '$lib/db/schema'
import { convertException } from '$lib/errors'
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
import { sendNotificationsToAllSubscriptions } from '$lib/notifications/notifications.server'
import { fail } from '@sveltejs/kit'
import { and, eq, isNotNull, not, sql } from 'drizzle-orm'

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

      const randomArea = await db.query.areas.findFirst({
        orderBy: sql`RANDOM()`,
        where: isNotNull(areas.parentFk),
        with: { parent: true },
      })

      const randomUser = await db.query.users.findFirst({
        orderBy: sql`RANDOM()`,
        where: not(eq(users.id, locals.user.id)),
      })

      if (randomArea == null || randomUser == null) {
        return fail(404)
      }

      await sendNotificationsToAllSubscriptions(
        [
          {
            body: `${randomUser.username} has updated ${randomArea.parent?.name} > ${randomArea.name} and 2 more`,
            tag: 'test',
            title: 'This is a test notification',
            type: 'moderate',
            userId: randomUser.id,
          },
        ],
        db,
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
          notifyModerations: values.notifyModerations === 'on',
          notifyNewAscents: values.notifyNewAscents === 'on',
          notifyNewUsers: values.notifyNewUsers === 'on',
        })
        .where(eq(userSettings.authUserFk, locals.user.authUserFk))
        .returning({
          notifyModerations: userSettings.notifyModerations,
          notifyNewAscents: userSettings.notifyNewAscents,
          notifyNewUsers: userSettings.notifyNewUsers,
        })

      return result
    })
  },
}
