import { CRON_API_KEY } from '$env/static/private'
import { db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { sendNotificationsToAllSubscriptions } from '$lib/notifications/notifications.server'
import { sub } from 'date-fns'
import { and, gte, inArray, isNull } from 'drizzle-orm'
import { timingSafeEqual } from 'node:crypto'
import { QUERY_INTERVAL_MINUTES, createNotifications, groupActivities } from './lib.server'

const verifyApiKey = (request: Request) => {
  const apiKey = request.headers.get('x-api-key')

  if (apiKey == null) {
    return false
  }

  try {
    return timingSafeEqual(Buffer.from(apiKey), Buffer.from(CRON_API_KEY))
  } catch (error) {
    return false
  }
}

export const POST = async ({ request }) => {
  if (!verifyApiKey(request)) {
    console.log('unauthorized')
    return new Response('Unauthorized', { status: 401 })
  }

  const activities = await getActivities()
  const regionFks = Array.from(new Set(activities.map((activity) => activity.regionFk)))
  const allGroups = await Promise.all(
    regionFks.map(async (regionFk) => {
      const regionActivities = activities.filter((activity) => activity.regionFk === regionFk)
      const groups = groupActivities(regionActivities)
      const notifications = await createNotifications(groups)
      await sendNotificationsToAllSubscriptions(notifications, db, undefined, regionFk)
      return groups
    }),
  )
  const groups = allGroups.flat()

  const notifiedActivityIds = groups.flatMap((group) => group.activities.map((activity) => activity.id))
  await db.update(schema.activities).set({ notified: true }).where(inArray(schema.activities.id, notifiedActivityIds))

  return new Response(null, { status: 200 })
}

const getActivities = async () => {
  const dateFilter = sub(new Date(), { minutes: QUERY_INTERVAL_MINUTES })

  const result = await db.query.activities.findMany({
    where: and(isNull(schema.activities.notified), gte(schema.activities.createdAt, dateFilter)),
  })

  return result
}
