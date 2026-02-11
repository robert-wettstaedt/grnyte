import { PRIVATE_VAPID_KEY } from '$env/static/private'
import { PUBLIC_TOPO_EMAIL, PUBLIC_VAPID_KEY } from '$env/static/public'
import * as schema from '$lib/db/schema'
import { defaultLanguage, type Language } from '$lib/i18n/utils'
import { eq, inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import webpush from 'web-push'
import type { Notification, NotificationTranslatable, TranslatedNotification } from '.'

webpush.setVapidDetails(`mailto:${PUBLIC_TOPO_EMAIL}`, PUBLIC_VAPID_KEY, PRIVATE_VAPID_KEY)

export const getGradeTemplateString = (gradeFk: number) => `{grade: ${gradeFk}}`

export const replaceGradeTemplateWithValue = (
  title: NotificationTranslatable,
  grades: schema.Grade[],
  gradingScale: keyof Omit<schema.Grade, 'id'> = 'FB',
): NotificationTranslatable => {
  function replace(s: string) {
    return s.replace(/{grade: \d+}/g, (match) => {
      const gradeFk = Number(match.match(/\d+/g)?.[0])
      const grade = grades.find((grade) => grade.id === gradeFk)
      return grade?.[gradingScale] ?? ''
    })
  }

  return {
    de: replace(title.de),
    en: replace(title.en),
  }
}

export const sendNotificationToSubscription = async (
  { body, title, ...rest }: TranslatedNotification,
  subscription: schema.PushSubscription,
) => {
  const { endpoint, expirationTime, auth, p256dh, lang } = subscription

  const notification: Notification = {
    ...rest,
    body: body?.[(lang ?? defaultLanguage) as Language],
    title: title?.[(lang ?? defaultLanguage) as Language],
  }

  await webpush.sendNotification({ endpoint, keys: { auth, p256dh }, expirationTime }, JSON.stringify(notification))
}

export const sendNotificationsToAllSubscriptions = async (
  notifications: TranslatedNotification[],
  db: PostgresJsDatabase<typeof schema>,
  userFk?: number,
  regionFk?: number,
) => {
  let userFks: number[] = []

  if (userFk != null) {
    userFks.push(userFk)
  }

  if (regionFk != null) {
    const regionMembers = await db.query.regionMembers.findMany({
      columns: { userFk: true },
      where: eq(schema.regionMembers.regionFk, regionFk),
    })
    userFks.push(...regionMembers.map((item) => item.userFk))
  }

  const subscriptions = await db.query.pushSubscriptions.findMany(
    userFks.length === 0 ? undefined : { where: inArray(schema.pushSubscriptions.userFk, userFks) },
  )
  const usersSettings = await db.query.userSettings.findMany(
    userFks.length === 0 ? undefined : { where: inArray(schema.userSettings.userFk, userFks) },
  )
  const grades = await db.query.grades.findMany()

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const userSettings = usersSettings.find((item) => item.userFk === subscription.userFk)

      if (userSettings == null) {
        return
      }

      await Promise.all(
        notifications
          .filter(({ userId, type }) => {
            return (
              //  Check user settings for allowed notification type
              ((userSettings.notifyNewAscents && type === 'ascent') ||
                (userSettings.notifyNewUsers && type === 'user') ||
                (userSettings.notifyModerations && type === 'moderate')) &&
              // Do not send to user who created the notification
              userId !== subscription.userFk
            )
          })
          .map(async (notification) => {
            const processed = {
              ...notification,
              body:
                notification.body == null
                  ? undefined
                  : replaceGradeTemplateWithValue(notification.body, grades, userSettings.gradingScale),
            }

            try {
              await sendNotificationToSubscription(processed, subscription)
            } catch (exception) {
              if (exception instanceof webpush.WebPushError) {
                if (exception.statusCode === 301) {
                  await db
                    .update(schema.pushSubscriptions)
                    .set({ endpoint: exception.endpoint })
                    .where(eq(schema.pushSubscriptions.id, subscription.id))
                } else if (exception.statusCode === 404 || exception.statusCode === 410) {
                  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, subscription.id))
                }
              } else {
                console.error(exception)
              }
            }
          }),
      )
    }),
  )
}
