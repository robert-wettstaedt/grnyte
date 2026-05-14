import { PUBLIC_BUNNY_STREAM_HOSTNAME } from '$env/static/public'
import { getVideoThumbnailUrl } from '$lib/bunny'
import { getParentWith, getQuery, getWhere, postProcessEntity } from '$lib/components/ActivityFeed/load.server'
import { config } from '$lib/config'
import { db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import type { Row } from '$lib/db/zero/types'
import { i18n } from '$lib/i18n/index.server'
import { languages } from '$lib/i18n/utils'
import type { NotificationTranslatable, TranslatedNotification } from '$lib/notifications'
import { getGradeTemplateString } from '$lib/notifications/notifications.server'
import { differenceInDays, differenceInMinutes } from 'date-fns'
import { eq, inArray } from 'drizzle-orm'

export const QUERY_INTERVAL_MINUTES = 30
export const DEBOUNCE_MINUTES = 5

export interface Group {
  activities: schema.Activity[]
  date: Date
  type: 'ascent' | 'user' | 'moderate'
  userFk: number
}

export const groupActivities = (activities: schema.Activity[]) => {
  let groups: Group[] = []

  activities.forEach((activity) => {
    const isAscent = activity.entityType === 'ascent'
    const isUser = activity.entityType === 'user'
    const isAscentOrUser = isAscent || isUser

    if (isAscent && activity.type !== 'created') {
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

export const createNotifications = async (groups: Group[]): Promise<TranslatedNotification[]> => {
  const userFks = Array.from(new Set(groups.map((group) => group.userFk)))
  const users = await db.query.users.findMany({
    where: inArray(schema.users.id, userFks),
    columns: { id: true, username: true },
  })

  const notifications = await Promise.all(
    groups.map(async (group): Promise<TranslatedNotification | undefined> => {
      const username = languages.reduce((obj, lang) => {
        const t = i18n.getFixedT(lang)

        return {
          ...obj,
          [lang]: users.find((user) => user.id === group.userFk)?.username ?? t('activity.someone'),
        }
      }, {} as NotificationTranslatable)

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

const getAscentNotification = async (
  group: Group,
  username: NotificationTranslatable,
): Promise<TranslatedNotification | undefined> => {
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

  const body = languages.reduce((obj, lang) => {
    const t = i18n.getFixedT(lang)

    const route = [
      ascent.route.name.length === 0 ? config.routes.defaultName : `"${ascent.route.name}"`,
      ascent.route.userGradeFk == null ? null : getGradeTemplateString(ascent.route.userGradeFk),
      ascent.route.userRating == null ? null : Array(ascent.route.userRating).fill('⭐️').join(''),
    ]
      .filter(Boolean)
      .join(' ')

    const type = t(`activity.ascent.types.${ascent.type}`)

    return {
      ...obj,
      [lang]: [
        t('activity.ascent.created', { user: username[lang], route, type }),
        ascents.length === 1 ? undefined : t('activity.more.ascents', { count: ascents.length - 1 }),
      ]
        .filter(Boolean)
        .join(' '),
    }
  }, {} as NotificationTranslatable)

  return {
    body,
    data: { pathname: `/ascents/${ascent.id}` },
    icon,
    tag: `${group.userFk}-${group.type}`,

    userId: group.userFk,
    type: 'ascent',
  }
}

const getUserNotification = async (
  group: Group,
  username: NotificationTranslatable,
): Promise<TranslatedNotification | undefined> => {
  interface ActivityFilter {
    filter: (activity: schema.Activity) => boolean
    withEntity: boolean
    getBody: (item: schema.Activity, user?: Row<'users'>) => NotificationTranslatable
  }

  const activityFilters: ActivityFilter[] = [
    {
      filter: (activity) => activity.type === 'created' && activity.columnName === 'role',
      getBody: (_, user) =>
        languages.reduce(
          (obj, lang) => ({
            ...obj,
            [lang]: i18n.getFixedT(lang)('activity.user.approved.user', {
              user: username[lang],
              other: user?.username,
            }),
          }),
          {} as NotificationTranslatable,
        ),
      withEntity: true,
    },
    {
      filter: (activity) => activity.type === 'updated' && activity.columnName === 'role',
      getBody: (_, user) =>
        languages.reduce(
          (obj, lang) => ({
            ...obj,
            [lang]: i18n.getFixedT(lang)('activity.user.roleUpdated.user', {
              user: username[lang],
              other: user?.username,
            }),
          }),
          {} as NotificationTranslatable,
        ),
      withEntity: true,
    },
    {
      filter: (activity) => activity.type === 'deleted' && activity.columnName === 'role',
      getBody: (_, user) =>
        languages.reduce(
          (obj, lang) => ({
            ...obj,
            [lang]: i18n.getFixedT(lang)('activity.user.removed.user', { user: username[lang], other: user?.username }),
          }),
          {} as NotificationTranslatable,
        ),
      withEntity: true,
    },
    {
      filter: (activity) => activity.type === 'created' && activity.columnName === 'invitation',
      getBody: (item) =>
        languages.reduce(
          (obj, lang) => ({
            ...obj,
            [lang]: i18n.getFixedT(lang)('activity.invitation.created.user', {
              user: username[lang],
              other: item.newValue,
            }),
          }),
          {} as NotificationTranslatable,
        ),
      withEntity: false,
    },
    {
      filter: (activity) => activity.type === 'updated' && activity.columnName === 'invitation',
      getBody: (item) =>
        languages.reduce(
          (obj, lang) => ({
            ...obj,
            [lang]: i18n.getFixedT(lang)('activity.invitation.accepted.user', { user: username[lang] }),
          }),
          {} as NotificationTranslatable,
        ),
      withEntity: false,
    },
    {
      filter: (activity) => activity.type === 'deleted' && activity.columnName === 'invitation',
      getBody: (item) =>
        languages.reduce(
          (obj, lang) => ({
            ...obj,
            [lang]: i18n.getFixedT(lang)('activity.invitation.removed.user', {
              user: username[lang],
              other: item.newValue,
            }),
          }),
          {} as NotificationTranslatable,
        ),
      withEntity: false,
    },
  ]

  for await (const item of activityFilters) {
    const array = group.activities.filter(item.filter)
    const activity = array.at(0)
    let user: Row<'users'> | undefined

    if (activity == null) {
      continue
    }

    if (item.withEntity) {
      const result = await getQuery(db, 'user').findFirst({
        where: getWhere('user', activity.entityId),
      })
      const entity = await postProcessEntity(db, 'user', result)

      if (entity?.object == null || !('username' in entity.object)) {
        continue
      }

      user = entity.object
    }

    const body = item.getBody(activity, user)

    return {
      body: languages.reduce(
        (obj, lang) => ({
          ...obj,
          [lang]: [
            body[lang],
            array.length === 1 ? null : i18n.getFixedT(lang)('activity.more.updates', { count: array.length - 1 }),
          ]
            .filter(Boolean)
            .join(' '),
        }),
        {} as NotificationTranslatable,
      ),
      data: { pathname: '/feed' },
      type: 'user',
      userId: group.userFk,
    }
  }
}

const getModerateNotification = async (
  group: Group,
  username: NotificationTranslatable,
): Promise<TranslatedNotification | undefined> => {
  const activities = group.activities.toSorted((a, b) => activityPriority(a) - activityPriority(b))

  const activity = activities.at(0)

  if (activity?.parentEntityId == null || activity.parentEntityType == null) {
    return
  }

  const parentEntity = await getQuery(db, activity.parentEntityType).findFirst({
    where: getWhere(activity.parentEntityType, activity.parentEntityId),
    with: getParentWith(activity.parentEntityType) as any,
  })

  const entity = parentEntity == null ? null : await postProcessEntity(db, activity.parentEntityType, parentEntity)
  const { breadcrumb, object, type } = entity ?? {}

  if (breadcrumb == null || object == null || !('name' in object) || type == null) {
    return
  }

  const body = languages.reduce((obj, lang) => {
    const t = i18n.getFixedT(lang)

    return {
      ...obj,
      [lang]: [
        t(`activity.generic.updated`, {
          user: username[lang],
          column: '',
          entity: breadcrumb.length === 0 ? object.name : breadcrumb.join(' > '),
        }),
        activities.length === 1
          ? null
          : i18n.getFixedT(lang)('activity.more.updates', { count: activities.length - 1 }),
      ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' '),
    }
  }, {} as NotificationTranslatable)

  return {
    body,
    data: { pathname: `/${type}s/${object.id}` },
    tag: `${group.userFk}-${group.type}`,

    userId: group.userFk,
    type: 'moderate',
  }
}

const ascentPriority = (ascent: schema.Ascent) => {
  return schema.ascentTypeEnum.indexOf(ascent.type)
}

const activityPriority = (activity: schema.Activity) => {
  const array = ['area', 'block', 'route']

  const index = array.indexOf(activity.entityType)
  return index === -1 && activity.parentEntityType != null ? array.indexOf(activity.parentEntityType) : index
}
