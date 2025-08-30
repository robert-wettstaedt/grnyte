import * as schema from '$lib/db/schema'
import type { IncludeRelation, InferResultType } from '$lib/db/types'
import { buildNestedAreaQuery } from '$lib/db/utils'
import { convertMarkdownToHtml } from '$lib/markdown'
import { loadFiles } from '$lib/nextcloud/nextcloud.server'
import { sub } from 'date-fns'
import { and, eq, gt, inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { Entity } from './'

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
    const createdAt = Math.floor(ascent.createdAt.getTime() / 1000)
    const date = new Date(ascent.dateTime)
    const dateTimeNum = date.toString() === 'Invalid Date' ? null : date.getTime()
    const authorCreatedAt = Math.floor(ascent.author.createdAt.getTime() / 1000)
    return {
      type: 'ascent',
      object: {
        ...ascent,
        author: { ...ascent.author, createdAt: authorCreatedAt },
        createdAt,
        dateTime: dateTimeNum,
        notes,
      },
    }
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
    const createdAt = Math.floor(route.createdAt.getTime() / 1000)
    return { type: 'route', object: { ...route, createdAt, description }, breadcrumb }
  }

  if (entityType === 'block' && object != null) {
    const block = object as InferResultType<'blocks', { area: { with: { parent: true } } }>
    const breadcrumb = [block.area?.parent?.name, block.area?.name].filter(Boolean) as Entity['breadcrumb']
    const createdAt = Math.floor(block.createdAt.getTime() / 1000)
    return { type: 'block', object: { ...block, createdAt }, breadcrumb }
  }

  if (entityType === 'area' && object != null) {
    const area = object as InferResultType<'areas', { parent: true }>
    const breadcrumb = [area.parent?.name].filter(Boolean) as Entity['breadcrumb']
    const description = await convertMarkdownToHtml(area.description ?? '', db)
    const createdAt = Math.floor(area.createdAt.getTime() / 1000)
    return { type: 'area', object: { ...area, createdAt, description }, breadcrumb }
  }

  return { type: entityType, object } as Entity
}

interface HandleOpts
  extends Pick<
    schema.InsertActivity,
    'entityId' | 'entityType' | 'userFk' | 'parentEntityId' | 'parentEntityType' | 'regionFk'
  > {
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
  regionFk,
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
          regionFk,
        }),
      ),
    )
  }
}

export const insertActivity = async (
  db: PostgresJsDatabase<typeof schema>,
  activity: schema.InsertActivity | schema.InsertActivity[],
) => {
  const arr = Array.isArray(activity) ? activity : [activity]

  if (arr.length > 0) {
    await db.insert(schema.activities).values(arr)
  }
}
