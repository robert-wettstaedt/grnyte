import { command } from '$app/server'
import { pushSubscriptions } from '$lib/db/schema'
import { enhance, type Action } from '$lib/forms/enhance.server'
import { languages } from '$lib/i18n/utils'
import { i18n } from '$lib/i18n/index.server'
import type { NotificationTranslatable } from '$lib/notifications'
import { error } from '@sveltejs/kit'
import { and, eq, sql } from 'drizzle-orm'
import z from 'zod'

const pushSubscriptionSchema = z.object({
  endpoint: z.string(),
  expirationTime: z.number().nullable().optional(),
  p256dh: z.string(),
  auth: z.string(),
  lang: z.string(),
})

const subscribeActionSchema = z.object({
  pushSubscriptionId: z.number().nullable().optional(),
  subscription: pushSubscriptionSchema,
})
type SubscribeActionValues = z.infer<typeof subscribeActionSchema>

export const subscribe = command(subscribeActionSchema, (arg) => enhance(arg, subscribeAction))

const unsubscribeActionSchema = z.number()
type UnsubscribeActionValues = z.infer<typeof unsubscribeActionSchema>

export const unsubscribe = command(unsubscribeActionSchema, (arg) => enhance(arg, unsubscribeAction))

export const sendTest = command(z.void(), (arg) => enhance(arg, sendTestAction))

const subscribeAction: Action<SubscribeActionValues, number> = async (values, db, user) => {
  if (values.pushSubscriptionId != null) {
    await db
      .delete(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.id, values.pushSubscriptionId), eq(pushSubscriptions.authUserFk, user.authUserFk)),
      )
  }

  const [result] = await db
    .insert(pushSubscriptions)
    .values({
      authUserFk: user.authUserFk,
      userFk: user.id,
      auth: values.subscription.auth,
      endpoint: values.subscription.endpoint,
      expirationTime: values.subscription.expirationTime,
      lang: values.subscription.lang,
      p256dh: values.subscription.p256dh,
    })
    .returning({ id: pushSubscriptions.id })

  return result.id
}

const unsubscribeAction: Action<UnsubscribeActionValues> = async (pushSubscriptionId, db, user) => {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.id, pushSubscriptionId), eq(pushSubscriptions.authUserFk, user.authUserFk)))
}

const sendTestAction: Action = async (_, db, user) => {
  const { sendNotificationsToAllSubscriptions } = await import('$lib/notifications/notifications.server')

  const userRegions = await db.query.regionMembers.findMany({
    where: (table, { and, eq, isNotNull }) => and(eq(table.authUserFk, user.authUserFk), isNotNull(table.isActive)),
    columns: {
      regionFk: true,
      role: true,
    },
    with: {
      region: {
        columns: {
          name: true,
          settings: true,
        },
      },
    },
  })

  const regionIds = userRegions.map((region) => region.regionFk)

  const randomArea = await db.query.areas.findFirst({
    orderBy: sql`RANDOM()`,
    where: (table, { isNotNull, and, inArray }) => and(isNotNull(table.parentFk), inArray(table.regionFk, regionIds)),
    with: { parent: true },
  })

  const randomUser = await db.query.regionMembers.findFirst({
    orderBy: sql`RANDOM()`,
    where: (table, { not, eq, and, inArray }) =>
      and(not(eq(table.userFk, user.id)), inArray(table.regionFk, regionIds)),
    with: {
      user: { columns: { username: true } },
    },
  })

  if (randomArea == null || randomUser == null) {
    error(404)
  }

  const body = languages.reduce((obj, lang) => {
    const t = i18n.getFixedT(lang)

    return {
      ...obj,
      [lang]: [
        t('activity.generic.updated', { user: randomUser.user.username, column: '', entity: randomArea.name }),
        t('activity.more.updates', { count: 2 }),
      ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' '),
    }
  }, {} as NotificationTranslatable)

  const title = languages.reduce((obj, lang) => {
    const t = i18n.getFixedT(lang)

    return {
      ...obj,
      [lang]: t('pushNotifications.test.title'),
    }
  }, {} as NotificationTranslatable)

  await sendNotificationsToAllSubscriptions(
    [{ body, tag: 'test', title, type: 'test', userId: randomUser.id }],
    db,
    user.id,
  )
}
