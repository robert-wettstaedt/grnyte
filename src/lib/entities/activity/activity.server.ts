import * as schema from '$lib/db/schema'
import { sub } from 'date-fns'
import { and, Column, eq, gt, isNull, or } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

/** What a mutation passes in: real ids. What reaches the table: text ids. */
export interface ActivityInput extends Omit<schema.InsertActivity, 'entityId' | 'parentEntityId'> {
  entityId: ActivityId
  parentEntityId?: ActivityId | null
}

/**
 * An id as a mutation holds it. `activities.entity_id` is text because the column is
 * polymorphic, but every table it points at except `files` keys on a number, so writers
 * used to spell the cast themselves at every call site. They did not spell it the same way:
 * some guarded the nullable parent, some did not, and the ones that did not wrote the
 * literal string "null", which `mapper.ts` still has to read back as absent. The cast lives
 * here now, so a caller states the id it has and nothing else.
 */
type ActivityId = number | string

const parentIdOf = (id: ActivityId | null | undefined) => (id == null ? null : String(id))

const toRow = ({ entityId, parentEntityId, ...rest }: ActivityInput): schema.InsertActivity => ({
  ...rest,
  entityId: String(entityId),
  parentEntityId: parentIdOf(parentEntityId),
})

interface HandleOpts extends Pick<schema.InsertActivity, 'entityType' | 'parentEntityType' | 'regionFk' | 'userFk'> {
  db: PostgresJsDatabase<typeof schema>
  entityId: ActivityId
  newEntity: Record<string, unknown>
  oldEntity: Record<string, unknown>
  parentEntityId?: ActivityId | null
}

export const createUpdateActivity = async ({
  db,
  entityId: rawEntityId,
  entityType,
  newEntity,
  oldEntity,
  parentEntityId: rawParentEntityId,
  parentEntityType,
  regionFk,
  userFk,
}: HandleOpts) => {
  const entityId = String(rawEntityId)
  const parentEntityId = parentIdOf(rawParentEntityId)
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

// Columns that define an activity's identity for the collapse below. Excludes id/createdAt
// (auto) and notified (see the note on `insertActivity`).
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
  activity: ActivityInput | ActivityInput[],
) => {
  const arr = (Array.isArray(activity) ? activity : [activity]).map(toRow)

  if (arr.length === 0) {
    return
  }

  // Collapse repeats until notified: drop any earlier row carrying identical values, so a
  // repeated save (a topo redrawn twice, a block nudged again) replaces its predecessor
  // instead of piling up duplicates.
  //
  // `notified` is the intended bound, and NOTHING SETS IT YET - the consumer that will is
  // still to be written. Until it lands, the filter matches every earlier row however old, so
  // the valueless activities (topo, location) keep one entry per person and entity for good.
  // That resolves itself when the consumer ships: a notified row stops being collapsible and
  // the window closes behind it.
  //
  // So do not replace the flag with a time bound. It would read like a fix for the unbounded
  // window and would instead fight the consumer this is waiting for. `createUpdateActivity`
  // is the one that uses 15 minutes, because its rows carry old/new values worth keeping apart.
  //
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
    Pick<schema.InsertActivity, 'columnName' | 'entityType' | 'newValue' | 'regionFk' | 'type' | 'userFk'>
  > & { entityId?: ActivityId },
) => {
  const { entityId, ...rest } = filter
  const conditions = Object.entries(entityId == null ? rest : { ...rest, entityId: String(entityId) })
    .filter(([, value]) => value != null)
    .map(([key, value]) => eq(schema.activities[key as keyof typeof filter] as Column, value))

  if (conditions.length > 0) {
    await db.delete(schema.activities).where(and(...conditions))
  }
}
