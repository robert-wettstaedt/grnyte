import * as schema from '$lib/db/schema'
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { EVENT_OBJECT_COLUMNS, type EventObjectType } from './dto'

export interface EventInput {
  actorFk: number
  /** What the sentence needs and the object cannot answer: a role, an invited address. */
  metadata?: null | string
  object: EventObject
  regionFk: number
  verb: schema.EventVerb
}

/** What a mutation names: the thing it acted on. `file` keys on a cuid, the rest on a serial. */
export interface EventObject {
  id: number | string
  type: EventObjectType
}

type Db = PostgresJsDatabase<typeof schema>

/**
 * How long a call has to continue an event before it opens a new one.
 *
 * The same 15 minutes the grace-window delete uses, and for the same reason: inside it, a person
 * is still finishing one action rather than starting another.
 *
 * A fixed span rather than a calendar one, so plain millisecond subtraction is exact: no month
 * length and no DST shift can change what "15 minutes ago" means.
 */
const FOLD_WINDOW_MS = 15 * 60 * 1000

/** One changed column, as a caller states it. */
export interface EventChange {
  columnName: string
  newValue: null | string
  oldValue: null | string
}

/** A diff of an entity, as `createUpdateEvent` takes it. */
export type EventDiff = Record<string, unknown>

/** What {@link deleteEvent} matches on. Every field is optional and an omitted one is
 *  unconstrained; an explicit `metadata: null` requires the column to BE null, which is the
 *  difference between a member removal and a revoked invitation. */
export interface EventFilter {
  actorFk?: number
  metadata?: null | string
  object?: EventObject
  regionFk?: number
  verb?: schema.EventVerb
}

/**
 * Whether a column actually moved.
 *
 * Surrounding whitespace does not count. Opening a description in the markdown editor and saving
 * it untouched reserialises it with a trailing newline, which is not an edit anybody made and
 * which logged a card whose two sides looked identical. A SQL NULL and a form's '' are likewise
 * the same state, "not set"; stringifying null to "null" logged a card reading "Not set" on both
 * sides of a v1 row somebody merely opened.
 *
 * Only the ends are trimmed. Whitespace INSIDE the value is left alone on purpose: in markdown two
 * spaces at the end of a line are a hard break, so collapsing runs would drop a real change. The
 * stored values keep their exact bytes either way; this decides only whether there was a change to
 * record.
 *
 * `writeChanges` reads the stored rows back and applies this in JS rather than in SQL, because
 * Postgres `btrim` strips spaces only and so disagreed with it on exactly the newline case above.
 */
export function changed(before: unknown, after: unknown): boolean {
  const normalise = (value: unknown) => (value == null ? '' : String(value).trim())
  return normalise(before) !== normalise(after)
}

/**
 * Diff an entity, open or continue its event, and record what moved.
 *
 * Replaces the activities log's write path. What is gone from the signature:
 * `parentEntityType`/`parentEntityId`, because a parent is reachable through the object's own
 * foreign key, and `entityType`/`entityId` as a polymorphic pair, because the object is typed.
 */
export async function createUpdateEvent(
  db: Db,
  {
    actorFk,
    metadata,
    newEntity,
    object,
    oldEntity,
    regionFk,
    verb = 'update',
  }: Omit<EventInput, 'verb'> & {
    newEntity: EventDiff
    oldEntity: EventDiff
    verb?: schema.EventVerb
  },
): Promise<boolean> {
  const changes: EventChange[] = Object.keys(newEntity)
    .filter((key) => changed(oldEntity[key], newEntity[key]))
    .map((key) => ({
      columnName: key,
      newValue: newEntity[key] == null ? null : String(newEntity[key]),
      oldValue: oldEntity[key] == null ? null : String(oldEntity[key]),
    }))

  if (changes.length === 0) {
    return false
  }

  const event = await insertEvent(db, { actorFk, metadata, object, regionFk, verb })
  return writeChanges(db, event, changes)
}

/**
 * Whether this call may continue the open event, by either of the two ways in.
 *
 * A refinement: an `update` joins an open `create`, `add` or `update`, so a burst of edits merges
 * into the action it refines. That is what makes "Anna added Traumtanz" absorb its own corrections,
 * and it is also what keeps pasting a source link onto a clip you just uploaded from rendering a
 * second card beside it. The old feed suppressed that pair at read time, in thirty lines of
 * grouping that had to recognise the shape after the fact; refining the `add` it belongs to is the
 * same rule the fold already applies everywhere else.
 *
 * A repeat: the same verb joins its own kind, which is the identity collapse the activities log's
 * insert path used to do. The fold key is already every column a caller sets, so a second call
 * landing on it is a byte-identical row. Three photos removed from one route in one sitting is one
 * card, not three indistinguishable ones, and inviting the same address twice does not stack up two.
 *
 * What neither admits is a DIFFERENT verb joining. Without that a `delete` five minutes after an
 * `update` on the same object joins it, keeps the verb `update`, and the deletion is never
 * recorded anywhere: the feed reports "Jonas edited Mara's ascent" for a row he removed.
 */
const REFINABLE = new Set<schema.EventVerb>(['add', 'create', 'update'])

const joins = (verb: schema.EventVerb, open: schema.Event) =>
  verb === open.verb || (verb === 'update' && REFINABLE.has(open.verb))

/**
 * Whether this row may be hard-deleted, or must soft-delete and keep its history.
 *
 * A row may go for good only if all three of these hold, and this takes all three because two of
 * them are generic and one is not:
 *
 * - **young enough**, which is the same 15 minutes everywhere
 * - **nobody has responded**, which is generic too: reactions and comments hang off `events`, and
 *   `events.<object>_fk ON DELETE CASCADE` takes them with the row without a word. A mistake
 *   leaves no trace; somebody else's words are not part of the mistake
 * - **`childless`**, which is entity-specific and only the caller can answer. A route means no
 *   ascents, files or topo lines; an area means no blocks; an ascent means nothing at all, since
 *   `deleteAscent` cascades its own media along with it
 *
 * That last one is a required argument rather than a note in this comment on purpose. It was a
 * note first, and the ascent call site did not check it, which is the shape of mistake a
 * parameter makes impossible: the only caller that may pass `true` is one that has thought about
 * what its children are.
 */
export async function canHardDelete(
  db: Db,
  { childless, createdAt, object }: { childless: boolean; createdAt: Date | number; object: EventObject },
): Promise<boolean> {
  if (!childless || !withinGraceWindow(createdAt)) {
    return false
  }

  // Soft-deleted reactions do not count. `reactions` keeps a removed row, so without this a tap
  // taken back a second later would disable the grace window for that entity forever.
  const [responded] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.reactions)
    .innerJoin(schema.events, eq(schema.events.id, schema.reactions.eventFk))
    .where(and(objectMatches(object), isNull(schema.reactions.deletedAt)))

  return responded.count === 0
}

/**
 * Erase the events a mutation logged, so an undo leaves the log as if nothing had happened.
 *
 * Replaces the activities log's delete path for the same six undo paths. Change rows go with the
 * event through `changes.event_fk on delete cascade`, so a filter that names the event is enough.
 *
 * ponytail: deletes every event matching the filter; a same-object collision is possible but
 * negligible right after the action being undone. Upgrade = pass the event id back through the
 * snapshot the client already round-trips.
 */
export async function deleteEvent(db: Db, filter: EventFilter): Promise<void> {
  const conditions = [
    filter.actorFk == null ? undefined : eq(schema.events.actorFk, filter.actorFk),
    filter.metadata === undefined
      ? undefined
      : filter.metadata === null
        ? isNull(schema.events.metadata)
        : eq(schema.events.metadata, filter.metadata),
    filter.object == null ? undefined : objectMatches(filter.object),
    filter.regionFk == null ? undefined : eq(schema.events.regionFk, filter.regionFk),
    filter.verb == null ? undefined : eq(schema.events.verb, filter.verb),
  ].filter((condition) => condition != null)

  // An unconstrained filter would delete the region's whole log, so it deletes nothing instead.
  if (conditions.length === 0) {
    return
  }

  await db.delete(schema.events).where(and(...conditions))
}

/**
 * Log that something happened, and return the event it landed on.
 *
 * One event per mutation call, its object the entity the call names. A call that continues an open
 * event on the same object joins it and bumps its timestamp so it returns to the top of the feed,
 * exactly as the per-column fold does today.
 *
 * Replaces the activities log's insert path, repeat-collapse included: see {@link joins}. Joining
 * is a better collapse than the delete-then-reinsert it used to do, because it keeps the event's
 * id stable, so a reaction attached to it survives the author saving again.
 */
export async function insertEvent(db: Db, input: EventInput): Promise<schema.Event> {
  const open = await openEvent(db, input)

  if (open != null && joins(input.verb, open)) {
    // The verb is NOT overwritten. A create that gains later edits is still a create; that is
    // what makes "Anna added Traumtanz" absorb its own refinements instead of becoming an update.
    // `clock_timestamp()`, not the Node clock: this is the only code that reassigns the column,
    // and the INSERT default is the Postgres one. Two clocks on one column means a host trailing
    // the database by a few hundred milliseconds writes a "refloated" card that sorts BELOW the
    // rows it was meant to rise above, and can land under a digest watermark that already passed.
    await db
      .update(schema.events)
      .set({ createdAt: sql`clock_timestamp()` })
      .where(eq(schema.events.id, open.id))

    // Deliberately the row as it was BEFORE the bump: `writeChanges` puts that timestamp back when
    // the edit turns out to have undone itself, so a create does not refloat for a no-op save.
    // Not the UPDATE's own RETURNING, which is empty whenever RLS lets the caller read the open
    // event but not write it, and destructuring that gave a null deref instead of an error.
    return open
  }

  const [created] = await db
    .insert(schema.events)
    .values({
      actorFk: input.actorFk,
      metadata: input.metadata ?? null,
      regionFk: input.regionFk,
      verb: input.verb,
      ...objectColumns(input.object),
    })
    .returning()

  return created
}

/**
 * `area_fk = 12`, and null for the other five. The CHECK requires exactly one to be set.
 *
 * Exported so `notify()` can write the same object into `notifications`, which mirrors these six
 * columns exactly: reusing this beats a second copy of the id/type-to-column mapping drifting out
 * of step with {@link EVENT_OBJECT_COLUMNS}.
 */
export function objectColumns(
  object: EventObject,
): Pick<schema.InsertEvent, (typeof EVENT_OBJECT_COLUMNS)[EventObjectType]> {
  const column = EVENT_OBJECT_COLUMNS[object.type]
  // `file_fk` is text and the rest are integers, which is the whole reason six columns beat one
  // polymorphic pair: each id keeps its own type instead of everything becoming text.
  const value = object.type === 'file' ? String(object.id) : Number(object.id)
  return { [column]: value } as never
}

/**
 * Whether a row is young enough to be deleted without trace.
 *
 * Deleted inside 15 minutes of creation, it was a mistake: it is hard-deleted and takes its events
 * with it through `on delete cascade`. Deleted later, it has been seen, so it soft-deletes and
 * keeps its history. The window matches the fold's for the same reason: inside it, nothing has
 * settled into being a fact yet.
 *
 * Only the age half. Reach for {@link canHardDelete} instead unless you genuinely want just this:
 * it asks the other two conditions as well, and takes the entity-specific one as an argument so
 * it cannot be skipped.
 */
export function withinGraceWindow(createdAt: Date | number): boolean {
  const created = typeof createdAt === 'number' ? createdAt : createdAt.getTime()
  return created > Date.now() - FOLD_WINDOW_MS
}

/**
 * Record what changed under an event, merging with anything the same call already wrote.
 *
 * Three behaviours, all of which the activities log's write path used to have at the row level
 * and which move here unchanged:
 *
 * 1. **Column merge.** A to B then B to C inside the window is one row, A to C. The intermediate
 *    was never a state the crag was left in. `ON CONFLICT` does it in one statement, where the old
 *    code read then wrote and could race a double submit into two contradictory rows.
 * 2. **Undo.** An edit that ends where it started deletes its row.
 * 3. **Empty update.** An `update` event left holding no changes deletes itself.
 *
 * Returns whether the submission changed anything at all, which is not the same as whether a row
 * survived: a change folded back into an earlier one is still an edit somebody made, and its owner
 * still wants telling. A save that touched nothing must announce nothing.
 */
export async function writeChanges(db: Db, event: schema.Event, changes: readonly EventChange[]): Promise<boolean> {
  const moved = changes.filter((change) => changed(change.oldValue, change.newValue))

  if (moved.length > 0) {
    // One statement for the whole diff. A seven-column ascent edit was seven sequential round
    // trips; `ON CONFLICT` still does the merge, keeping where each column started and taking
    // where it ended.
    await db
      .insert(schema.changes)
      .values(
        moved.map((change) => ({
          columnName: change.columnName,
          eventFk: event.id,
          newValue: change.newValue,
          oldValue: change.oldValue,
          regionFk: event.regionFk,
        })),
      )
      .onConflictDoUpdate({
        set: { newValue: sql`excluded.new_value` },
        target: [schema.changes.eventFk, schema.changes.columnName],
      })
  }

  // Undo, checked against the STORED start rather than this call's, so A to B then B to A across
  // two saves is caught as well as within one.
  //
  // Read back and judge in JS rather than in SQL. Postgres `btrim` strips spaces only, so it
  // disagreed with `changed()` on exactly the case the rule exists for: a description that
  // reserialises with a trailing newline is an undo to `changed()` and a real edit to `btrim`,
  // which is how "description changed from text to text" got onto a card.
  const stored = await db.select().from(schema.changes).where(eq(schema.changes.eventFk, event.id))
  const undone = stored.filter((row) => !changed(row.oldValue, row.newValue))

  if (undone.length > 0) {
    await db.delete(schema.changes).where(
      inArray(
        schema.changes.id,
        undone.map((row) => row.id),
      ),
    )
  }

  if (stored.length === undone.length) {
    // An update that undid itself is not an event. Unless somebody has already responded to it:
    // deleting it here would cascade their reactions and comments away, and a thread that
    // vanishes because the author edited a typo back is worse than a card with an empty diff.
    // A withdrawn reaction is not a response: `reactions` soft-deletes, so the row is still there.
    const [responded] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.reactions)
      .where(and(eq(schema.reactions.eventFk, event.id), isNull(schema.reactions.deletedAt)))

    if (event.verb === 'update' && responded.count === 0) {
      await db.delete(schema.events).where(eq(schema.events.id, event.id))
    } else {
      // The event survives holding nothing, so it must not have moved. `insertEvent` bumps the
      // open event before anybody knows a change will survive, which floated "Anna added
      // Traumtanz" back to the top of the feed for a rename she typed and untyped.
      await db.update(schema.events).set({ createdAt: event.createdAt }).where(eq(schema.events.id, event.id))
    }
  }

  return moved.length > 0
}

/** The equality test for "the same object", spelled once so the fold and its callers agree. */
function objectMatches(object: EventObject) {
  const column = EVENT_OBJECT_COLUMNS[object.type]
  const value = object.type === 'file' ? String(object.id) : Number(object.id)

  return and(
    eq(schema.events[column], value),
    // Every other object column must be null, or an event about a different entity that happens
    // to share an id would match. The CHECK guarantees only one is set, not WHICH one.
    ...Object.values(EVENT_OBJECT_COLUMNS)
      .filter((other) => other !== column)
      .map((other) => isNull(schema.events[other])),
  )
}

/**
 * The event this call belongs to: the one it continues, or a new one.
 *
 * The fold key is `(actor, object, region, metadata)` and deliberately NOT the verb. A save five
 * minutes after your own `create` joins the create, which is what today's created-suppression does
 * except that it kept nothing; here the refinements survive as change rows under "Anna added
 * Traumtanz". Two people editing the same route in the same minute still get an event each,
 * because the actor is in the key.
 *
 * `metadata` scopes it for the same reason it scopes the old fold: it holds what a change is ABOUT
 * rather than what it changed, so two photos on one block are two events rather than one.
 */
async function openEvent(db: Db, input: EventInput): Promise<schema.Event | undefined> {
  const [open] = await db
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.actorFk, input.actorFk),
        eq(schema.events.regionFk, input.regionFk),
        objectMatches(input.object),
        input.metadata == null ? isNull(schema.events.metadata) : eq(schema.events.metadata, input.metadata),
        gt(schema.events.createdAt, new Date(Date.now() - FOLD_WINDOW_MS)),
      ),
    )
    .orderBy(sql`${schema.events.createdAt} desc`)
    .limit(1)

  return open
}
