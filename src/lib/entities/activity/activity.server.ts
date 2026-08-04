import * as schema from '$lib/db/schema'
import { sub } from 'date-fns'
import { and, Column, eq, gt, isNull, or } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { ActivityEntityType } from './dto'
import type { DeclaredActivity, DeclaredColumn } from './verbs'

/**
 * What a mutation passes in: real ids, and a triple the catalogue declares.
 *
 * The triple half comes from `ACTIVITY_VERBS`, so the catalogue is the one declaration of
 * what an activity can be. A writer cannot invent a triple, and deleting a catalogue entry
 * stops its writer compiling. What it still cannot check is a writer picking the wrong
 * declared triple, which is why `leaveRegion` needs a column of its own rather than a type.
 */
export type ActivityInput = DeclaredActivity &
  Omit<schema.InsertActivity, 'columnName' | 'entityId' | 'entityType' | 'parentEntityId' | 'type'> & {
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

/**
 * The columns a diff on `E` may emit. `Partial<Record<never, unknown>>` is `{}`, which
 * accepts anything, so an entity with no declared update columns has to reject outright
 * rather than wave every key through.
 */
type DiffEntity<E extends ActivityEntityType> = [DeclaredColumn<E>] extends [never]
  ? Record<string, never>
  : Partial<Record<DeclaredColumn<E>, unknown>>

interface HandleOpts<E extends ActivityEntityType> extends Pick<
  schema.InsertActivity,
  'metadata' | 'parentEntityType' | 'regionFk' | 'userFk'
> {
  db: PostgresJsDatabase<typeof schema>
  entityId: ActivityId
  entityType: E
  /**
   * Keys held against the catalogue. This only bites on a fresh object literal (excess
   * property checking), and all five call sites pass one inline; hoisting it into a variable
   * would silently lose the check.
   */
  newEntity: DiffEntity<E>
  oldEntity: DiffEntity<E>
  parentEntityId?: ActivityId | null
}

export const createUpdateActivity = async <E extends ActivityEntityType>({
  db,
  entityId: rawEntityId,
  entityType,
  metadata,
  newEntity,
  oldEntity,
  parentEntityId: rawParentEntityId,
  parentEntityType,
  regionFk,
  userFk,
}: HandleOpts<E>) => {
  const entityId = String(rawEntityId)
  const parentEntityId = parentIdOf(rawParentEntityId)
  const changes: Pick<schema.InsertActivity, 'columnName' | 'newValue' | 'oldValue'>[] = []

  // Widened to iterate. The keys were already held against the catalogue at the call site,
  // where the object literal is fresh; `DiffEntity<E>` is a conditional type, so TypeScript
  // cannot prove `DeclaredColumn<E>` indexes it from in here.
  const next = newEntity as Record<string, unknown>
  const prev = oldEntity as Record<string, unknown>

  Object.keys(next).forEach((key) => {
    if (String(prev[key] ?? null) !== String(next[key] ?? null)) {
      changes.push({
        columnName: key,
        newValue: next[key] == null ? null : String(next[key]),
        oldValue: prev[key] == null ? null : String(prev[key]),
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

  // A second edit of the same column folds into the row the first one wrote: its `oldValue`
  // stays and the newer `newValue` lands on it, so A→B followed by B→C reads as A→C. The
  // intermediate B is nobody's business - it was never a state the crag was left in.
  //
  // `metadata` scopes the fold. It holds what a change is ABOUT rather than what it changed
  // (a topo row names the photo there), and two photos of one block are two changes, not one.
  await Promise.all(
    existingActivities
      .filter((activity) => activity.type === 'updated' && (activity.metadata ?? null) === (metadata ?? null))
      .map(async (activity) => {
        const change = changes.find((change) => change.columnName === activity.columnName)

        if (change == null) {
          return
        }

        changes.splice(changes.indexOf(change), 1)

        // Folded back to where it started: a pin nudged and nudged back, a line redrawn and
        // undone. There is no change left to report, and a row that kept its own start and
        // end would report one ("A → A", which the location renderer reads as "confirmed").
        if (change.newValue === activity.oldValue) {
          return db.delete(schema.activities).where(eq(schema.activities.id, activity.id))
        }

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
          metadata,
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
 *
 *  An omitted field is unconstrained; an explicit `null` requires the column to BE null. The
 *  two are not the same and the difference is the whole point: `{ entityType: 'route',
 *  type: 'deleted' }` also matches the `route:deleted:file` rows a photo removal logged, so
 *  restoring a route erased its photo history along with its own delete. An undo of a
 *  whole-entity delete passes `columnName: null` and erases only the row it wrote.
 *
 *  ponytail: deletes all rows matching the filter; a same-entity history collision is
 *  possible but negligible right after a delete. Upgrade = scope by id/createdAt. */
export const deleteActivity = async (
  db: PostgresJsDatabase<typeof schema>,
  filter: Partial<
    Pick<schema.InsertActivity, 'columnName' | 'entityType' | 'newValue' | 'regionFk' | 'type' | 'userFk'>
  > & { entityId?: ActivityId },
) => {
  const conditions = activityFilterConditions(filter)

  if (conditions.length > 0) {
    await db.delete(schema.activities).where(and(...conditions))
  }
}

/** Exported for the test: an omitted field must contribute nothing and an explicit `null`
 *  must contribute an `IS NULL`, which is the difference the six whole-entity undos rely on. */
export function activityFilterConditions(filter: Parameters<typeof deleteActivity>[1]) {
  const { entityId, ...rest } = filter

  return Object.entries(entityId == null ? rest : { ...rest, entityId: String(entityId) })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      const column = schema.activities[key as keyof typeof filter] as Column
      return value === null ? isNull(column) : eq(column, value)
    })
}
