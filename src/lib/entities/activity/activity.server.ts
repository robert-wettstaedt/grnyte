import * as schema from '$lib/db/schema'
import { sub } from 'date-fns'
import { and, Column, eq, gt, isNull, or } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

interface HandleOpts extends Pick<
  schema.InsertActivity,
  'entityId' | 'entityType' | 'parentEntityId' | 'parentEntityType' | 'regionFk' | 'userFk'
> {
  db: PostgresJsDatabase<typeof schema>
  newEntity: Record<string, unknown>
  oldEntity: Record<string, unknown>
}

export const createUpdateActivity = async ({
  db,
  entityId,
  entityType,
  newEntity,
  oldEntity,
  parentEntityId,
  parentEntityType,
  regionFk,
  userFk,
}: HandleOpts) => {
  const changes: Pick<schema.InsertActivity, 'columnName' | 'newValue' | 'oldValue'>[] = []

  Object.keys(newEntity).forEach((key) => {
    if (String(oldEntity[key] ?? null) !== String(newEntity[key] ?? null)) {
      changes.push({
        columnName: key,
        newValue: newEntity[key] == null ? null : String(newEntity[key]),
        oldValue: oldEntity[key] == null ? null : String(oldEntity[key]),
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
          columnName: change.columnName,
          entityId,
          entityType,
          newValue: change.newValue,
          oldValue: change.oldValue,
          parentEntityId,
          parentEntityType,
          regionFk,
          type: 'updated',
          userFk,
        }),
      ),
    )
  }
}

// Columns that define an activity's identity for debounce. Excludes id/createdAt (auto) and
// notified (the flag we filter on).
const activityValueColumns = [
  'type',
  'userFk',
  'entityId',
  'entityType',
  'parentEntityId',
  'parentEntityType',
  'columnName',
  'metadata',
  'oldValue',
  'newValue',
  'regionFk',
] as const

export const insertActivity = async (
  db: PostgresJsDatabase<typeof schema>,
  activity: schema.InsertActivity | schema.InsertActivity[],
) => {
  const arr = Array.isArray(activity) ? activity : [activity]

  if (arr.length === 0) {
    return
  }

  // Debounce until notified: drop not-yet-notified rows carrying the same values first, so
  // repeated saves (e.g. topo edits) collapse into one instead of piling up duplicates.
  // ponytail: one delete per item; callers pass a single activity today. Upgrade = batch if
  // an array ever gets large.
  for (const item of arr) {
    const conditions = activityValueColumns.map((key) => {
      const value = item[key] ?? null
      const column = schema.activities[key] as Column
      return value == null ? isNull(column) : eq(column, value)
    })

    await db
      .delete(schema.activities)
      .where(and(or(isNull(schema.activities.notified), eq(schema.activities.notified, false)), ...conditions))
  }

  // Collapse exact-duplicate rows within a single call (same identity), last-writer-wins, so a
  // multi-item batch can't insert two rows the per-item debounce above just cleared as one.
  const deduped = new Map<string, schema.InsertActivity>()
  for (const item of arr) {
    const key = activityValueColumns.map((col) => JSON.stringify(item[col] ?? null)).join('|')
    deduped.set(key, item)
  }

  await db.insert(schema.activities).values([...deduped.values()])
}

/** Delete activities matching the given fields. Used by undo flows to erase the activity a
 *  mutation logged, leaving the timeline as if it never happened.
 *  ponytail: deletes all rows matching the filter; a same-entity history collision is
 *  possible but negligible right after a delete. Upgrade = scope by id/createdAt. */
export const deleteActivity = async (
  db: PostgresJsDatabase<typeof schema>,
  filter: Partial<
    Pick<schema.InsertActivity, 'columnName' | 'entityId' | 'entityType' | 'regionFk' | 'type' | 'userFk'>
  >,
) => {
  const conditions = Object.entries(filter)
    .filter(([, value]) => value != null)
    .map(([key, value]) => eq(schema.activities[key as keyof typeof filter] as Column, value))

  if (conditions.length > 0) {
    await db.delete(schema.activities).where(and(...conditions))
  }
}
