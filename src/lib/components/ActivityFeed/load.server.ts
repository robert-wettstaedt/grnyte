import type { ActivityDTO, ActivityGroup, Entity } from '$lib/components/ActivityFeed'
import { config } from '$lib/config'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import type { InsertActivity } from '$lib/db/schema'
import * as schema from '$lib/db/schema'
import type { IncludeRelation, InferResultType } from '$lib/db/types'
import { buildNestedAreaQuery } from '$lib/db/utils'
import { validateObject } from '$lib/forms.server'
import { getUser } from '$lib/helper.server'
import { convertMarkdownToHtml } from '$lib/markdown'
import { loadFiles } from '$lib/nextcloud/nextcloud.server'
import { getPaginationQuery, paginationParamsSchema } from '$lib/pagination.server'
import { error } from '@sveltejs/kit'
import { and, asc, count, desc, eq, type SQLWrapper } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { z } from 'zod'

const getQuery = (db: PostgresJsDatabase<typeof schema>, entityType: schema.Activity['entityType']) => {
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

const getWith = (
  entityType: schema.Activity['entityType'],
): IncludeRelation<'ascents' | 'routes' | 'blocks' | 'areas'> => {
  switch (entityType) {
    case 'ascent':
      return { author: true, files: true } as IncludeRelation<'ascents'>
    default:
      return {}
  }
}

const getParentWith = (
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

const postProcessEntity = async (
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
    const activityDate = new Date(activity.createdAt)
    const entityKey = `${activity.userFk}-${activity.entityType}-${activity.entityId}`
    const parentKey = activity.parentEntityId
      ? `${activity.userFk}-${activity.parentEntityType}-${activity.parentEntityId}`
      : null

    let foundGroup = false
    const newGroupKey = `group-${groups.size}`

    // Try to find an existing group that this activity belongs to
    for (const [groupKey, group] of groups.entries()) {
      const firstActivity = group.items[0]
      const timeDiff = Math.abs(activityDate.getTime() - new Date(firstActivity.createdAt).getTime())

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
          if (activityDate > group.latestDate) {
            group.latestDate = activityDate
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
        latestDate: activityDate,
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
    const user = await getUser(locals.user, db)
    if (user == null) {
      error(404)
    }

    const searchParamsObj = Object.fromEntries(url.searchParams.entries())
    const searchParams = await validateObject(searchParamsSchema, searchParamsObj)

    const allQueries = [...(queries ?? [])]

    if (searchParams.user === 'me') {
      allQueries.push(eq(schema.activities.userFk, user.id))
    }

    if (searchParams.type === 'ascents') {
      allQueries.push(eq(schema.activities.entityType, 'ascent'), eq(schema.activities.type, 'created'))
    }

    const where = and(...allQueries)

    const activities = await db.query.activities.findMany({
      ...getPaginationQuery(searchParams),
      orderBy: [desc(schema.activities.createdAt), asc(schema.activities.id)],
      where: where,
      with: {
        user: true,
      },
    })

    const activitiesDTOs = await Promise.all(
      activities.map(async (activity): Promise<ActivityDTO> => {
        const query = getQuery(db, activity.entityType)
        const parentQuery = activity.parentEntityType == null ? null : getQuery(db, activity.parentEntityType)

        const entity = await query.findFirst({
          where: (table) => eq(table.id, activity.entityId),
          with: getWith(activity.entityType),
        })
        const parentEntity =
          activity.parentEntityId == null && activity.parentEntityType == null
            ? null
            : await parentQuery?.findFirst({
                where: (table) => eq(table.id, activity.parentEntityId!),
                with: getParentWith(activity.parentEntityType),
              })

        return {
          ...activity,
          entity: await postProcessEntity(db, activity.entityType, entity),
          entityName: entity?.name,
          parentEntity:
            activity.parentEntityType == null || parentEntity == null
              ? undefined
              : await postProcessEntity(db, activity.parentEntityType, parentEntity),
          parentEntityName: parentEntity?.name,
        }
      }),
    )

    const countResults = await db.select({ count: count() }).from(schema.activities).where(and(where))
    const groupedActivities = groupActivities(activitiesDTOs)

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
  extends Pick<InsertActivity, 'entityId' | 'entityType' | 'userFk' | 'parentEntityId' | 'parentEntityType'> {
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
  const changes: Pick<InsertActivity, 'columnName' | 'oldValue' | 'newValue'>[] = []

  Object.keys(newEntity).forEach((key) => {
    if (String(oldEntity[key] ?? null) !== String(newEntity[key] ?? null)) {
      changes.push({
        columnName: key,
        oldValue: oldEntity[key] == null ? null : String(oldEntity[key]),
        newValue: newEntity[key] == null ? null : String(newEntity[key]),
      })
    }
  })

  if (changes.length > 0) {
    await Promise.all(
      changes.map((change) =>
        db.insert(schema.activities).values({
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
  }
}
