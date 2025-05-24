import { CRON_API_KEY } from '$env/static/private'
import { PUBLIC_APPLICATION_NAME, PUBLIC_BUNNY_STREAM_HOSTNAME } from '$env/static/public'
import { getVideoThumbnailUrl } from '$lib/bunny'
import { getParentWith, getQuery, getWhere, postProcessEntity } from '$lib/components/ActivityFeed/load.server'
import { config } from '$lib/config'
import { db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import type { Notification } from '$lib/notifications'
import { getGradeTemplateString, sendNotificationsToAllSubscriptions } from '$lib/notifications/notifications.server'
import { differenceInDays, differenceInMinutes, sub } from 'date-fns'
import { and, eq, gte, inArray, isNull } from 'drizzle-orm'

const QUERY_INTERVAL_MINUTES = 30
const DEBOUNCE_MINUTES = 5

const verifyApiKey = (request: Request) => {
  const apiKey = request.headers.get('x-api-key')
  return apiKey === CRON_API_KEY
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
      const groups = groupActivities(activities)
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

interface Group {
  activities: schema.Activity[]
  date: Date
  type: 'ascent' | 'user' | 'moderate'
  userFk: number
}

const getActivities = async () => {
  const dateFilter = sub(new Date(), { minutes: QUERY_INTERVAL_MINUTES })

  const result = await db.query.activities.findMany({
    where: and(isNull(schema.activities.notified), gte(schema.activities.createdAt, dateFilter)),
  })

  return result
}

const groupActivities = (activities: schema.Activity[]) => {
  let groups: Group[] = []

  activities.forEach((activity) => {
    const isAscentOrUser = activity.entityType === 'ascent' || activity.entityType === 'user'

    if (isAscentOrUser && activity.type !== 'created') {
      return
    }

    const type = isAscentOrUser ? (activity.entityType as Group['type']) : 'moderate'

    let item = groups.find((item) => item.type === type && item.userFk === activity.userFk)

    if (item == null) {
      item = { activities: [], date: new Date(), type, userFk: activity.userFk }
      groups.push(item)
    }

    item.activities.push(activity)
  })

  groups = groups
    .map((group) => {
      const sorted = group.activities.toSorted((a, b) => {
        return b.createdAt.getTime() - a.createdAt.getTime()
      })

      return { ...group, activities: sorted, date: sorted[0].createdAt }
    })
    .filter((group) => group.activities.length > 0 && differenceInMinutes(new Date(), group.date) > DEBOUNCE_MINUTES)

  return groups
}

const createNotifications = async (groups: Group[]): Promise<Notification[]> => {
  const userFks = Array.from(new Set(groups.map((group) => group.userFk)))
  const users = await db.query.users.findMany({
    where: inArray(schema.users.id, userFks),
    columns: { id: true, username: true },
  })

  const notifications = await Promise.all(
    groups.map(async (group): Promise<Notification | undefined> => {
      const username = users.find((user) => user.id === group.userFk)?.username ?? 'Unknown User'

      switch (group.type) {
        case 'ascent':
          return getAscentNotification(group, username)

        case 'user':
          return getUserNotification(group, username)

        case 'moderate':
          return getModerateNotification(group, username)

        default:
          return
      }
    }),
  )

  return notifications.filter((item) => item != null)
}

const getAscentNotification = async (group: Group, username: string): Promise<Notification | undefined> => {
  const ascentIds = Array.from(new Set(group.activities.map((activity) => Number(activity.entityId))))
  const ascents = await db.query.ascents.findMany({
    where: inArray(schema.ascents.id, ascentIds),
    with: { route: true },
  })

  const ascent = ascents
    .toSorted((a, b) => {
      if (a.type !== b.type) {
        return ascentPriority(a) - ascentPriority(b)
      }

      return (b.gradeFk ?? b.route.userGradeFk ?? -1) - (a.gradeFk ?? a.route.userGradeFk ?? -1)
    })
    .filter((ascent) => differenceInDays(new Date(), new Date(ascent.dateTime)) <= 2)
    .at(0)

  if (ascent == null) {
    return
  }

  let files = await db.query.files.findMany({
    where: eq(schema.files.ascentFk, ascent.id),
  })

  if (files.length === 0) {
    files = await db.query.files.findMany({
      where: eq(schema.files.routeFk, ascent.route.id),
    })

    if (files.length === 0) {
      files = await db.query.files.findMany({
        where: eq(schema.files.blockFk, ascent.route.blockFk),
      })
    }
  }

  const file = files
    .toSorted((a, b) => {
      return (b.bunnyStreamFk == null ? 0 : 1) - (a.bunnyStreamFk == null ? 0 : 1)
    })
    .at(0)

  const icon =
    file?.bunnyStreamFk == null
      ? undefined
      : getVideoThumbnailUrl({ format: 'jpg', hostname: PUBLIC_BUNNY_STREAM_HOSTNAME, videoId: file.bunnyStreamFk })

  return {
    body: [
      username,
      ascentVerb(ascent),
      ascent.route.name.length === 0 ? config.routes.defaultName : `"${ascent.route.name}"`,
      ascent.route.userGradeFk == null ? null : getGradeTemplateString(ascent.route.userGradeFk),
      ascent.route.userRating == null ? null : Array(ascent.route.userRating).fill('⭐️').join(''),
      ascents.length > 1 ? `and climbed ${ascents.length - 1} more` : null,
    ]
      .filter(Boolean)
      .join(' '),
    data: { pathname: `/ascents/${ascent.id}` },
    icon,
    tag: `${group.userFk}-${group.type}`,

    userId: group.userFk,
    type: 'ascent',
  }
}

const getUserNotification = async (group: Group, username: string): Promise<Notification | undefined> => {
  return {
    body: `${username} has joined ${PUBLIC_APPLICATION_NAME}`,
    data: { pathname: `/users/${group.userFk}` },

    userId: group.userFk,
    type: 'user',
  }
}

const getModerateNotification = async (group: Group, username: string): Promise<Notification | undefined> => {
  const activities = group.activities.toSorted((a, b) => activityPriority(a) - activityPriority(b))

  const activity = activities.at(0)

  if (activity?.parentEntityId == null || activity.parentEntityType == null) {
    return
  }

  const parentEntity = await getQuery(db, activity.parentEntityType).findFirst({
    where: getWhere(activity.parentEntityType, activity.parentEntityId),
    with: getParentWith(activity.parentEntityType),
  })

  const entity = parentEntity == null ? null : await postProcessEntity(db, activity.parentEntityType, parentEntity)

  if (entity?.breadcrumb == null || entity.object == null || !('name' in entity.object)) {
    return
  }

  return {
    body: [
      username,
      'has updated',
      entity.breadcrumb.length === 0 ? entity.object.name : entity.breadcrumb.join(' > '),
      activities.length === 1 ? null : `and ${activities.length - 1} more`,
    ]
      .filter(Boolean)
      .join(' '),
    data: { pathname: `/${entity.type}s/${entity.object.id}` },
    tag: `${group.userFk}-${group.type}`,

    userId: group.userFk,
    type: 'moderate',
  }
}

const ascentPriority = (ascent: schema.Ascent) => {
  return schema.ascentTypeEnum.indexOf(ascent.type)
}

const ascentVerb = (ascent: schema.Ascent) => {
  switch (ascent.type) {
    case 'flash':
      return 'flashed'
    case 'send':
      return 'sent'
    case 'attempt':
      return 'attempted'
    case 'repeat':
      return 'repeated'
  }
}

const activityPriority = (activity: schema.Activity) => {
  const array = ['area', 'block', 'route']

  const index = array.indexOf(activity.entityType)
  return index === -1 && activity.parentEntityType != null ? array.indexOf(activity.parentEntityType) : index
}
