import type { ActivityListItem, ActivityType } from '$lib/entities/activity/dto'
import type { EventChangeItem, EventListItem } from './mapper'

/**
 * An event as the verb catalogue still reads it.
 *
 * `verbs.ts` keys every sentence, icon and diff renderer on the triple
 * `(entityType, type, columnName)`, and `change.ts` and the push digest read the same catalogue.
 * Rekeying all of that on `(verb, objectType)` is a large change to files this migration has not
 * reached yet, and doing it here would mean holding two catalogues at once.
 *
 * So the read path converts instead. This is the exact inverse of the CASE the backfill used to
 * derive verbs from those triples, which is what makes it faithful rather than approximate: a
 * migrated row and a freshly written event resolve to the same catalogue entry.
 *
 * ponytail: an adapter, not a design. It exists so card assembly can move without the catalogue
 * moving in the same step. Upgrade = rekey `verbs.ts` on the verb during the rename, and delete
 * this file; nothing else imports the legacy shape by then.
 */

/** Columns the old shape used to encode an action that is now a verb of its own. */
const COLUMN_FOR_VERB: Partial<Record<EventListItem['verb'], string>> = {
  accept: 'invitation',
  invite: 'invitation',
  join: 'role',
  leave: 'membership',
}

/**
 * `remove` is the one arm the verb alone cannot invert.
 *
 * The backfill collapsed six triples onto it (`*:deleted` with any column), so going back needs
 * the object as well. Without this a photo pulled off a route resolves `route:deleted` and the
 * card reads "Ada deleted the route Rampe" for a removed photo, which is the worst sentence in
 * the catalogue to render by accident.
 *
 * `user` splits on whether an address was recorded, which is the same discriminator the region
 * code and the mapper already use to tell a revoked invitation from a removed member.
 */
function removedColumn(event: EventListItem): string {
  return event.objectType === 'user' ? (event.metadata == null ? 'role' : 'invitation') : 'file'
}

const TYPE_FOR_VERB: Record<EventListItem['verb'], ActivityType> = {
  accept: 'updated',
  add: 'uploaded',
  create: 'created',
  delete: 'deleted',
  invite: 'created',
  join: 'created',
  leave: 'deleted',
  remove: 'deleted',
  update: 'updated',
}

/** One change row as the catalogue reads it: the event's triple with the column that moved. */
export function legacyChange(event: EventListItem, change: EventChangeItem): ActivityListItem {
  return {
    ...legacyEvent(event),
    columnName: change.columnName,
    // A change may name a different row than its event does, which is what lets a reorder's three
    // change rows each name their own block.
    entityId: String(change.objectId ?? event.objectId),
    entityType: change.objectType ?? event.objectType,
    newValue: change.newValue,
    oldValue: change.oldValue,
  }
}

/**
 * The triple a catalogue lookup wants, for the event itself.
 *
 * A change row carries its own `columnName`, so an `update` event resolves one entry per change
 * rather than one for the event; {@link legacyChange} is that case.
 */
export function legacyEvent(event: EventListItem): ActivityListItem {
  return {
    columnName: event.verb === 'remove' ? removedColumn(event) : COLUMN_FOR_VERB[event.verb],
    createdAt: event.createdAt,
    entityId: String(event.objectId),
    entityType: event.objectType,
    id: event.id,
    metadata: event.metadata,
    // The catalogue keys SOME families on the value rather than the column: logging an ascent
    // resolves `ascent:created:flash`, not `ascent:created`, which is how each type gets its own
    // sentence and status glyph. The old rows carried that in `new_value`; events do not, because
    // it is a column of the ascent, so it is read back off the resolved entity.
    //
    // Scoped to the one family the catalogue value-scopes today (`ascent:created`). `verbId`
    // prefers `new_value` over `column_name` wherever a family declares one, so handing it over
    // for a family that does not would turn `user:created:role` into `user:created` and miss.
    //
    // ponytail: pinned to that family by hand rather than derived from `VALUE_SCOPED`, which
    // `verbs.ts` builds precisely so a second value-scoped family needs no change. A second one
    // would silently lose its sentence here. Upgrade = export the set and read it, which is free
    // once the catalogue is rekeyed on the verb and this file goes.
    newValue: valueOf(event),
    // The payload the write path put in `metadata`, handed back to the readers that still look in
    // the value columns: `names: 'stored'` renders an invitation's address from `new_value`, and
    // the removal media word is `storedMedia(old_value)`. Copying `metadata` alone left an
    // invitation with a placeholder name and every removed photo reading as generic "media".
    oldValue: event.verb === 'remove' ? event.metadata : undefined,
    parentEntityId: event.parent == null ? undefined : String(event.parent.id),
    // `file` and `user` are objects but never parents in the old shape, and the catalogue's
    // parent type is the narrower set. Anything outside it reads as no parent, which is what the
    // old rows carried anyway.
    parentEntityType:
      event.parent == null || event.parent.type === 'file' || event.parent.type === 'user'
        ? undefined
        : event.parent.type,
    regionFk: event.regionFk,
    type: TYPE_FOR_VERB[event.verb],
    userFk: event.actorFk,
    userName: event.actorName,
  }
}

/**
 * Every catalogue lookup one event produces.
 *
 * An `update` produces one per change, because that is what the old shape wrote: one row per
 * column. Everything else produces exactly one, and an `update` that somehow carries no changes
 * still produces its own, so a card can never end up with nothing to say.
 */
export function legacyRows(event: EventListItem): ActivityListItem[] {
  if (event.verb !== 'update' || event.changes.length === 0) {
    return [legacyEvent(event)]
  }

  return event.changes.map((change) => legacyChange(event, change))
}

/** The value column, for the families the catalogue keys on a value rather than a column. */
function valueOf(event: EventListItem): string | undefined {
  if (event.objectType === 'ascent' && event.verb === 'create') {
    return event.entity?.ascentType
  }

  // Not value-scoped, but read directly by `names: 'stored'`, which resolves an invitation's
  // address off the row rather than off an entity because the invitee has no account.
  return event.verb === 'invite' || event.verb === 'accept' ? event.metadata : undefined
}
