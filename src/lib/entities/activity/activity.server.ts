import * as schema from '$lib/db/schema'
import { sub } from 'date-fns'
import { and, Column, eq, gt } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

interface HandleOpts extends Pick<
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

/** Delete activities matching the given fields. Used by undo flows to erase the activity a
 *  mutation logged, leaving the timeline as if it never happened.
 *  ponytail: deletes all rows matching the filter; a same-entity history collision is
 *  possible but negligible right after a delete. Upgrade = scope by id/createdAt. */
export const deleteActivity = async (
  db: PostgresJsDatabase<typeof schema>,
  filter: Partial<Pick<schema.InsertActivity, 'entityId' | 'entityType' | 'type' | 'columnName' | 'userFk'>>,
) => {
  const conditions = Object.entries(filter)
    .filter(([, value]) => value != null)
    .map(([key, value]) => eq(schema.activities[key as keyof typeof filter] as Column, value))

  if (conditions.length > 0) {
    await db.delete(schema.activities).where(and(...conditions))
  }
}
