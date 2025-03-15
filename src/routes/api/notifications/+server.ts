import { PRIVATE_VAPID_KEY } from '$env/static/private'
import { PUBLIC_TOPO_EMAIL, PUBLIC_VAPID_KEY } from '$env/static/public'
import { db } from '$lib/db/db.server'
import { activities, pushSubscriptions } from '$lib/db/schema'
import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import webpush from 'web-push'

webpush.setVapidDetails(`mailto:${PUBLIC_TOPO_EMAIL}`, PUBLIC_VAPID_KEY, PRIVATE_VAPID_KEY)

export const GET = async () => {
  const minutesAgo = new Date()
  minutesAgo.setMinutes(minutesAgo.getMinutes() - 30)

  const act = await db.query.activities.findMany({
    orderBy: desc(activities.createdAt),
    where: and(isNull(activities.notified), gte(activities.createdAt, minutesAgo)),
  })

  const results = await db.query.pushSubscriptions.findMany()

  await Promise.all(
    results.map(async (item) => {
      const { endpoint, expirationTime, auth, p256dh } = item
      try {
        await webpush.sendNotification(
          { endpoint, keys: { auth, p256dh }, expirationTime },
          JSON.stringify({
            title: 'Crag Track Notification',
            body: 'This is a test notification',
            icon: '/android-chrome-192x192.png',
          }),
        )
      } catch (exception) {
        if (exception instanceof webpush.WebPushError) {
          if (exception.statusCode === 301) {
            await db
              .update(pushSubscriptions)
              .set({ endpoint: exception.endpoint })
              .where(eq(pushSubscriptions.id, item.id))
          } else if (exception.statusCode === 404 || exception.statusCode === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, item.id))
          }
        } else {
          console.error(exception)
        }
      }
    }),
  )

  console.log('sent')

  return new Response(null, { status: 200 })
}

export const POST = () => {
  console.log('hello')
  return new Response('hello')
}
