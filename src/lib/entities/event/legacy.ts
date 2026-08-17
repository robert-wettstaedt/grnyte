import type { CatalogueEntityType, CatalogueRow, CatalogueType } from '$lib/entities/event/catalogue'
import { parseTopoChange } from '$lib/entities/topo/change'
import { parseCoords } from '$lib/map/coords'
import type { EventChangeItem, EventListItem } from './mapper'
import { verbEntry } from './verbs'

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

/** One change row as the catalogue reads it: the event's triple with the column that moved. */
export function legacyChange(event: EventListItem, change: EventChangeItem): CatalogueRow {
  const base = legacyEvent(event)
  const entityType = (change.objectType ?? event.objectType) as CatalogueEntityType

  return {
    ...base,
    columnName: change.columnName,
    // A change may name a different row than its event does, which is what lets a reorder's three
    // change rows each name their own block.
    entityId: String(change.objectId ?? event.objectId),
    entityType: change.objectType ?? event.objectType,
    newValue: change.newValue,
    oldValue: change.oldValue,
    // A cleared column is its own sentence where the catalogue has one. Without this a block whose
    // pin was removed reads "You updated the location of Nordblock", and the entry that says it
    // was removed is unreachable.
    type: clears(entityType, change.columnName, change.newValue ?? undefined) ? 'deleted' : base.type,
  }
}

/**
 * The triple a catalogue lookup wants, for the event itself.
 *
 * A change row carries its own `columnName`, so an `update` event resolves one entry per change
 * rather than one for the event; {@link legacyChange} is that case.
 */
export function legacyEvent(event: EventListItem): CatalogueRow {
  const { columnName, type } = triple(event)

  return {
    columnName,
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
    type,
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
export function legacyRows(event: EventListItem): CatalogueRow[] {
  if (event.verb !== 'update' || event.changes.length === 0) {
    return [legacyEvent(event)]
  }

  return event.changes.map((change) => legacyChange(event, change))
}

/**
 * Whether the catalogue has a separate sentence for CLEARING this column.
 *
 * Four columns do, and each says something a reader cannot infer from the update sentence: a pin
 * removed is not a pin moved, and "updated the location" on a block that no longer has one reads
 * as still pinned. The old shape spelled the difference at the write site by choosing the type;
 * an event carries only the column and its new value, so the choice moves here.
 */
function clears(entityType: CatalogueEntityType, columnName: string, newValue: string | undefined): boolean {
  return (newValue == null || newValue.length === 0) && verbEntry({ columnName, entityType, type: 'deleted' }) != null
}

/**
 * The `(type, columnName)` pair an event resolves to.
 *
 * This is the whole difficulty of the adapter. The backfill derived a verb FROM a column, and
 * several columns collapsed onto one verb: `add` covers an upload, a parking pin and a claimed
 * first ascent, and `remove` covers six triples. Going back needs the object AND what the writer
 * wrote in `metadata`, which is exactly what distinguishes them at the write site.
 *
 * Guessing instead is not a vague sentence, it is a wrong one: a removed parking pin resolved
 * `area:deleted:file` and the card read "removed media from Steinbruch", and a claimed first
 * ascent resolved a triple with no entry at all and fell through to "made a change".
 */
function triple(event: EventListItem): { columnName?: string; type: CatalogueType } {
  const { metadata, objectType, verb } = event

  switch (verb) {
    // Three different actions, told apart by what the writer recorded: a pin is coordinates, a
    // claimed first ascent is a name on a user, and everything else is a file landing somewhere.
    case 'add':
      if (objectType === 'area' && parseCoords(metadata) != null) {
        return { columnName: 'parking location', type: 'updated' }
      }
      if (objectType === 'user') {
        return { columnName: 'first ascensionist', type: 'updated' }
      }
      return { type: 'uploaded' }

    // A membership removal and a revoked invitation share the verb and the subject, and the
    // address is what tells them apart, which is the same discriminator the region code uses.
    case 'remove':
      if (objectType === 'user') {
        return { columnName: metadata == null ? 'role' : 'invitation', type: 'deleted' }
      }
      if (objectType === 'area' && parseCoords(metadata) != null) {
        return { columnName: 'parking location', type: 'deleted' }
      }
      if (objectType === 'block' && parseTopoChange(metadata) != null) {
        return { columnName: 'topo', type: 'deleted' }
      }
      // A block's pin, cleared. Backfilled rows carry the coordinates here, and without this they
      // land on `block:deleted:file` and read as media removed from the block.
      if (objectType === 'block' && parseCoords(metadata) != null) {
        return { columnName: 'location', type: 'deleted' }
      }
      return { columnName: 'file', type: 'deleted' }

    // A topo edit that moved no column of its own (a photo added, the order changed) says which
    // it was in `metadata`. One that DID move a column carries a change row, and `legacyChange`
    // overrides this with it.
    case 'update':
      return objectType === 'block' && parseTopoChange(metadata) != null
        ? { columnName: 'topo', type: 'updated' }
        : { type: 'updated' }

    case 'accept':
      return { columnName: 'invitation', type: 'updated' }

    case 'create':
      return { type: 'created' }

    case 'delete':
      return { type: 'deleted' }

    case 'invite':
      return { columnName: 'invitation', type: 'created' }

    // Backfill only: nothing writes it, and the catalogue has no entry for it, so it degrades to
    // the vaguer verb for its entity. See `legacy.test.ts`.
    case 'join':
      return { columnName: 'role', type: 'created' }

    case 'leave':
      return { columnName: 'membership', type: 'deleted' }
  }
}

/** The value column, for the families the catalogue keys on a value rather than a column. */
function valueOf(event: EventListItem): string | undefined {
  if (event.objectType === 'ascent' && event.verb === 'create') {
    return event.entity?.ascentType
  }

  // Not value-scoped, but read directly by the renderers that show a STORED value rather than a
  // resolved one: an invitation's address (the invitee has no account to resolve) and a claimed
  // first ascensionist's name. Without the second, the card that exists to record which climbing
  // identity was claimed renders "Not set" on both sides of its own change line.
  return event.verb === 'invite' || event.verb === 'accept' || (event.verb === 'add' && event.objectType === 'user')
    ? event.metadata
    : undefined
}
