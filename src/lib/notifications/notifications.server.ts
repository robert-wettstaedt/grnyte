import { PRIVATE_VAPID_KEY } from '$env/static/private'
import { PUBLIC_TOPO_EMAIL, PUBLIC_VAPID_KEY } from '$env/static/public'
import * as schema from '$lib/db/schema'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import webpush from 'web-push'
import type { Notification } from '.'

webpush.setVapidDetails(`mailto:${PUBLIC_TOPO_EMAIL}`, PUBLIC_VAPID_KEY, PRIVATE_VAPID_KEY)

export const getGradeTemplateString = (gradeFk: number) => `{grade: ${gradeFk}}`

export const replaceGradeTemplateWithValue = (
  title: string,
  grades: schema.Grade[],
  gradingScale: keyof Omit<schema.Grade, 'id'> = 'FB',
): string => {
  return title.replace(/{grade: \d+}/g, (match) => {
    const gradeFk = Number(match.match(/\d+/g)?.[0])
    const grade = grades.find((grade) => grade.id === gradeFk)
    return grade?.[gradingScale] ?? ''
  })
}

export const sendNotificationToSubscription = async (
  notification: Notification,
  subscription: schema.PushSubscription,
) => {
  const { endpoint, expirationTime, auth, p256dh } = subscription

  await webpush.sendNotification({ endpoint, keys: { auth, p256dh }, expirationTime }, JSON.stringify(notification))
}

export const sendNotificationsToAllSubscriptions = async (
  notifications: Notification[],
  db: PostgresJsDatabase<typeof schema>,
  userFk?: number,
) => {
  const subscriptions = await db.query.pushSubscriptions.findMany(
    userFk == null ? undefined : { where: eq(schema.pushSubscriptions.userFk, userFk) },
  )
  const usersSettings = await db.query.userSettings.findMany(
    userFk == null ? undefined : { where: eq(schema.userSettings.userFk, userFk) },
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
              title: replaceGradeTemplateWithValue(notification.title, grades, userSettings.gradingScale),
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
