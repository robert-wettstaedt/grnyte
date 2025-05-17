import { getFromCacheWithDefault, invalidateCache } from '$lib/cache/cache.server'
import type { ActivityDTO, ActivityGroup, Entity } from '$lib/components/ActivityFeed'
import { config } from '$lib/config'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import type { IncludeRelation, InferResultType } from '$lib/db/types'
import { buildNestedAreaQuery } from '$lib/db/utils'
import { validateObject } from '$lib/forms.server'
import { convertMarkdownToHtml } from '$lib/markdown'
import { loadFiles } from '$lib/nextcloud/nextcloud.server'
import { getPaginationQuery, paginationParamsSchema } from '$lib/pagination.server'
import { error } from '@sveltejs/kit'
import { sub } from 'date-fns'
import { and, asc, count, desc, eq, gt, inArray, type SQLWrapper } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { z } from 'zod'

export const getQuery = (db: PostgresJsDatabase<typeof schema>, entityType: schema.Activity['entityType']) => {
  switch (entityType) {
    case 'area':
      return db.query.areas
    case 'block':
      return db.query.blocks
    case 'route':
      return db.query.routes
    case 'file':
      return db.query.files
    case 'ascent':
      return db.query.ascents
    case 'user':
      return db.query.users
  }
}

export const getWhere = (entityType: schema.Activity['entityType'], entityId: schema.Activity['entityId']) => {
  switch (entityType) {
    case 'area':
      return eq(schema.areas.id, Number(entityId))
    case 'block':
      return eq(schema.blocks.id, Number(entityId))
    case 'route':
      return eq(schema.routes.id, Number(entityId))
    case 'file':
      return eq(schema.files.id, entityId)
    case 'ascent':
      return eq(schema.ascents.id, Number(entityId))
    case 'user':
      return eq(schema.users.id, Number(entityId))
  }
}

export const getWhereArr = (entityType: schema.Activity['entityType'], entityIds: schema.Activity['entityId'][]) => {
  const numIds = entityIds.map(Number).filter((num) => !Number.isNaN(num))

  switch (entityType) {
    case 'area':
      return inArray(schema.areas.id, numIds)
    case 'block':
      return inArray(schema.blocks.id, numIds)
    case 'route':
      return inArray(schema.routes.id, numIds)
    case 'file':
      return inArray(schema.files.id, entityIds)
    case 'ascent':
      return inArray(schema.ascents.id, numIds)
    case 'user':
      return inArray(schema.users.id, numIds)
  }
}

export const getWith = (
  entityType: schema.Activity['entityType'],
): IncludeRelation<'ascents' | 'routes' | 'blocks' | 'areas'> => {
  switch (entityType) {
    case 'ascent':
      return { author: true, files: true } as IncludeRelation<'ascents'>
    default:
      return {}
  }
}

export const getParentWith = (
  entityType: schema.Activity['parentEntityType'],
): IncludeRelation<'routes' | 'blocks' | 'areas'> => {
  const blockWith = { area: buildNestedAreaQuery(2) } as IncludeRelation<'blocks'>
  const routeWith = { block: { with: blockWith } } as IncludeRelation<'routes'>

  switch (entityType) {
    case 'route':
      return routeWith
    case 'block':
      return blockWith
    case 'area':
      return { parent: buildNestedAreaQuery(2) } as IncludeRelation<'areas'>
    default:
      return {}
  }
}

export const postProcessEntity = async (
  db: PostgresJsDatabase<typeof schema>,
  entityType: schema.Activity['entityType'],
  object: unknown,
): Promise<Entity> => {
  if (entityType === 'ascent' && object != null) {
    const ascent = object as InferResultType<'ascents', { author: true; files: true }>
    ascent.files = await loadFiles(ascent.files ?? [])
    const notes = await convertMarkdownToHtml(ascent.notes ?? '', db)
    return { type: 'ascent', object: { ...ascent, notes } }
  }

  if (entityType === 'file' && object != null) {
    const file = object as InferResultType<'files'>
    const [fileDTO] = await loadFiles([file])
    return { type: 'file', object: fileDTO }
  }

  if (entityType === 'route' && object != null) {
    const route = object as InferResultType<'routes', { block: { with: { area: { with: { parent: true } } } } }>
    const breadcrumb = [route.block?.area?.parent?.name, route.block?.area?.name, route.block?.name].filter(
      Boolean,
    ) as Entity['breadcrumb']
    const description = await convertMarkdownToHtml(route.description ?? '', db)
    return { type: 'route', object: { ...route, description }, breadcrumb }
  }

  if (entityType === 'block' && object != null) {
    const block = object as InferResultType<'blocks', { area: { with: { parent: true } } }>
    const breadcrumb = [block.area?.parent?.name, block.area?.name].filter(Boolean) as Entity['breadcrumb']
    return { type: 'block', object: block, breadcrumb }
  }

  if (entityType === 'area' && object != null) {
    const area = object as InferResultType<'areas', { parent: true }>
    const breadcrumb = [area.parent?.name].filter(Boolean) as Entity['breadcrumb']
    const description = await convertMarkdownToHtml(area.description ?? '', db)
    return { type: 'area', object: { ...area, description }, breadcrumb }
  }

  return { type: entityType, object } as Entity
}

const resolveEntities = async (
  db: PostgresJsDatabase<typeof schema>,
  activities: schema.Activity[],
  entityTypes: schema.Activity['entityType'][],
  parent: boolean,
) => {
  const objects = await Promise.all(
    entityTypes.map(async (entityType) => {
      const ids = activities
        .filter((activity) => (parent ? activity.parentEntityType : activity.entityType) === entityType)
        .map((activity) => (parent ? activity.parentEntityId : activity.entityId))
        .filter((id) => id != null)
      const distinctIds = Array.from(new Set(ids))

      const query = getQuery(db, entityType)
      const objects = await query.findMany({
        where: getWhereArr(entityType, distinctIds),
        with: getWith(entityType),
      })

      return objects.map((object) => ({ entityType, object }))
    }),
  )

  const wrappers = await Promise.all(
    objects.flat().map(async ({ entityType, object }) => {
      const res = { entity: await postProcessEntity(db, entityType, object), object }
      return res
    }),
  )

  return wrappers
}

const searchParamsSchema = z.intersection(
  z.object({
    type: z.enum(['all', 'ascents']).optional(),
    user: z.enum(['all', 'me']).optional(),
  }),
  paginationParamsSchema,
)

export const groupActivities = (activities: ActivityDTO[]): ActivityGroup[] => {
  const groups: Map<string, ActivityGroup> = new Map()
  const entityToGroupKey: Map<string, string> = new Map()

  for (const activity of activities) {
    const entityKey = `${activity.userFk}-${activity.entityType}-${activity.entityId}`
    const parentKey = activity.parentEntityId
      ? `${activity.userFk}-${activity.parentEntityType}-${activity.parentEntityId}`
      : null

    let foundGroup = false
    const newGroupKey = `group-${groups.size}`

    // Try to find an existing group that this activity belongs to
    for (const [groupKey, group] of groups.entries()) {
      const firstActivity = group.items[0]
      const timeDiff = Math.abs(activity.createdAt.getTime() - new Date(firstActivity.createdAt).getTime())

      if (activity.userFk === firstActivity.userFk && timeDiff <= config.activityFeed.groupTimeLimit) {
        const firstActivityEntityKey = `${firstActivity.userFk}-${firstActivity.entityType}-${firstActivity.entityId}`
        const firstActivityParentKey = firstActivity.parentEntityId
          ? `${firstActivity.userFk}-${firstActivity.parentEntityType}-${firstActivity.parentEntityId}`
          : null

        // Check if this activity shares either entity or parent with the group
        const isConnected =
          entityKey === firstActivityEntityKey ||
          (parentKey && parentKey === firstActivityParentKey) ||
          // Check if the current activity's entity is connected to this group
          entityToGroupKey.get(entityKey) === groupKey ||
          // Check if the current activity's parent is connected to this group
          (parentKey && entityToGroupKey.get(parentKey) === groupKey) ||
          // Check if the first activity's entity is connected to the same group as current activity
          entityToGroupKey.get(firstActivityEntityKey) === entityToGroupKey.get(entityKey) ||
          // Check if the first activity's parent is connected to the same group as current activity
          (firstActivityParentKey && entityToGroupKey.get(firstActivityParentKey) === entityToGroupKey.get(entityKey))

        if (isConnected) {
          group.items.push(activity)
          if (activity.createdAt > group.latestDate) {
            group.latestDate = activity.createdAt
            group.entity = activity.entity
            group.parentEntity = activity.parentEntity
          }

          // Update entity to group mappings
          entityToGroupKey.set(entityKey, groupKey)
          if (parentKey) {
            entityToGroupKey.set(parentKey, groupKey)
          }

          foundGroup = true
          break
        }
      }
    }

    // If no matching group was found, create a new one
    if (!foundGroup) {
      groups.set(newGroupKey, {
        items: [activity],
        user: activity.user,
        parentEntity: activity.parentEntity,
        entity: activity.entity,
        latestDate: activity.createdAt,
      })

      // Initialize entity to group mappings
      entityToGroupKey.set(entityKey, newGroupKey)
      if (parentKey) {
        entityToGroupKey.set(parentKey, newGroupKey)
      }
    }
  }

  return Array.from(groups.values())
}

export const loadFeed = async ({ locals, url }: { locals: App.Locals; url: URL }, queries?: SQLWrapper[]) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    if (locals.user == null) {
      error(404)
    }

    const searchParamsObj = Object.fromEntries(url.searchParams.entries())
    const searchParams = await validateObject(searchParamsSchema, searchParamsObj)

    const allQueries = [...(queries ?? [])]

    if (searchParams.user === 'me') {
      allQueries.push(eq(schema.activities.userFk, locals.user.id))
    }

    if (searchParams.type === 'ascents') {
      allQueries.push(eq(schema.activities.entityType, 'ascent'), eq(schema.activities.type, 'created'))
    }

    const where = and(...allQueries)
    const countResults = await db.select({ count: count() }).from(schema.activities).where(and(where))

    const groupedActivities = await getFromCacheWithDefault(
      config.cache.keys.activityFeed,
      async () => {
        const activities = await db.query.activities.findMany({
          ...getPaginationQuery(searchParams),
          orderBy: [desc(schema.activities.createdAt), asc(schema.activities.id)],
          where: where,
          with: {
            user: true,
          },
        })

        const distinctEntityTypes = Array.from(new Set(activities.map((activity) => activity.entityType)))
        const distinctParentEntityTypes = Array.from(
          new Set(activities.map((activity) => activity.parentEntityType)),
        ).filter((type) => type != null)

        const [entities, parentEntities] = await Promise.all([
          resolveEntities(db, activities, distinctEntityTypes, false),
          resolveEntities(db, activities, distinctParentEntityTypes, true),
        ])

        const activitiesDTOs = activities
          .map((activity): ActivityDTO | null => {
            const wrapper = entities.find(
              (item) =>
                item.entity.object != null &&
                String(item.entity.object.id) === activity.entityId &&
                item.entity.type === activity.entityType,
            )

            const parentWrapper = parentEntities.find(
              (item) =>
                item.entity.object != null &&
                String(item.entity.object.id) === activity.parentEntityId &&
                item.entity.type === activity.parentEntityType,
            )

            if (wrapper?.entity == null) {
              return null
            }

            return {
              ...activity,
              entity: wrapper?.entity,
              entityName: wrapper?.object?.name,
              parentEntity: parentWrapper?.entity,
              parentEntityName: parentWrapper?.object?.name,
            }
          })
          .filter((item) => item != null)

        return groupActivities(activitiesDTOs)
      },
      async () => allQueries.length === 0 && searchParams.page === 1 && searchParams.pageSize === 15,
      null,
    )

    return {
      activities: groupedActivities,
      pagination: {
        page: searchParams.page,
        pageSize: searchParams.pageSize,
        total: countResults[0].count,
        totalPages: Math.ceil(countResults[0].count / searchParams.pageSize),
      },
    }
  })
}

interface HandleOpts
  extends Pick<schema.InsertActivity, 'entityId' | 'entityType' | 'userFk' | 'parentEntityId' | 'parentEntityType'> {
  oldEntity: Record<string, unknown>
  newEntity: Record<string, unknown>
  db: PostgresJsDatabase<typeof schema>
}

export const createUpdateActivity = async ({
  oldEntity,
  newEntity,
  db,
  entityId,
  entityType,
  userFk,
  parentEntityId,
  parentEntityType,
}: HandleOpts) => {
  const changes: Pick<schema.InsertActivity, 'columnName' | 'oldValue' | 'newValue'>[] = []

  Object.keys(newEntity).forEach((key) => {
    if (String(oldEntity[key] ?? null) !== String(newEntity[key] ?? null)) {
      changes.push({
        columnName: key,
        oldValue: oldEntity[key] == null ? null : String(oldEntity[key]),
        newValue: newEntity[key] == null ? null : String(newEntity[key]),
      })
    }
  })

  const existingActivities = await db.query.activities.findMany({
    where: and(
      eq(schema.activities.entityId, entityId),
      eq(schema.activities.entityType, entityType),
      eq(schema.activities.userFk, userFk),
      gt(schema.activities.createdAt, sub(new Date(), { minutes: 15 })),
    ),
  })

  await Promise.all(
    existingActivities
      .filter((activity) => activity.type === 'updated')
      .map(async (activity) => {
        const change = changes.find((change) => change.columnName === activity.columnName)

        if (change == null) {
          return
        }

        changes.splice(changes.indexOf(change), 1)

        return db
          .update(schema.activities)
          .set({ createdAt: new Date(), newValue: change.newValue })
          .where(eq(schema.activities.id, activity.id))
      }),
  )

  if (existingActivities.some((activity) => activity.type === 'created')) {
    return
  }

  if (changes.length > 0) {
    await db.insert(schema.activities).values(
      changes.map(
        (change): schema.InsertActivity => ({
          type: 'updated',
          userFk,
          entityId,
          entityType,
          columnName: change.columnName,
          oldValue: change.oldValue,
          newValue: change.newValue,
          parentEntityId,
          parentEntityType,
        }),
      ),
    )
    await invalidateCache(config.cache.keys.activityFeed)
  }
}

export const insertActivity = async (
  db: PostgresJsDatabase<typeof schema>,
  activity: schema.InsertActivity | schema.InsertActivity[],
) => {
  const arr = Array.isArray(activity) ? activity : [activity]

  if (arr.length > 0) {
    await db.insert(schema.activities).values(arr)
    await invalidateCache(config.cache.keys.activityFeed)
  }
}
