import { parseTopoChange } from '$lib/entities/topo/change'
import { parseCoords } from '$lib/map/coords'
import type { EventObjectType } from './dto'
import type { EventChangeItem, EventListItem, EventVerb } from './mapper'

/**
 * One line a card can speak: an event, narrowed to the one thing that line is about.
 *
 * An event with two changed columns is two lines, because the catalogue has a sentence per column
 * and a card renders one per change. Everything else is one line. This is what the sentence lookup
 * and the change renderers read, and it is derived from the event directly: there is no
 * intermediate shape and nothing is inferred backwards from a column to a verb.
 *
 * What still has to be read out of `metadata` is the writers' own encoding rather than a leftover:
 * a `remove` on an area with coordinates in it is a parking pin, the same verb with a topo change
 * in it is a photo pulled off a block, and on a user an address means an invitation was withdrawn
 * where its absence means somebody was removed. The write path stores those distinctions there,
 * so the card reads them there.
 */
export interface CardLine {
  actorFk: number
  /** The actor's username; empty while the user row has not synced. */
  actorName: string
  /** Whether this line's column ended up empty, which two sentences differ on. */
  cleared: boolean
  /** The column this line is about, where the line is about one. */
  columnName: string | undefined
  createdAt: number
  /** The event's id. Several lines of one event share it; `change.ts` keys on it plus the column. */
  id: number
  metadata: string | undefined
  newValue: string | undefined
  /** What this line names, which is the change's own object where it has one (a reorder names the
   *  block that moved, not the area the event is about). */
  objectId: number | string
  objectType: EventObjectType
  oldValue: string | undefined
  /** The place the object sits in, flattened off the event. */
  parentId: number | string | undefined
  parentType: EventObjectType | undefined
  regionFk: number
  /** What scopes the sentence where a column does not: the type a logged ascent recorded. */
  value: string | undefined
  verb: EventVerb
}

/**
 * Every line one event produces.
 *
 * An `update` produces one per changed column, and an update carrying none still produces its own,
 * so a card can never end up with nothing to say.
 */
export function eventLines(event: EventListItem): CardLine[] {
  if (event.verb !== 'update' || event.changes.length === 0) {
    return [line(event)]
  }

  return event.changes.map((change) => line(event, change))
}

/**
 * The column a line is about when no change row names one.
 *
 * Four actions share the `add` and `remove` verbs and are told apart by what the writer recorded,
 * which is the same thing that tells them apart at the write site. Guessing instead is not a vague
 * sentence but a wrong one: without this a cleared parking pin reads as media removed from the
 * area, and a claimed first ascent has no sentence at all.
 */
function columnFor(event: EventListItem): string | undefined {
  const { metadata, objectType, verb } = event

  if (verb === 'add') {
    if (objectType === 'area' && parseCoords(metadata) != null) return 'parking location'
    if (objectType === 'user') return 'first ascensionist'
    return undefined
  }

  if (verb === 'remove') {
    if (objectType === 'user') return metadata == null ? 'role' : 'invitation'
    if (objectType === 'area' && parseCoords(metadata) != null) return 'parking location'
    if (objectType === 'block' && parseTopoChange(metadata) != null) return 'topo'
    if (objectType === 'block' && parseCoords(metadata) != null) return 'location'
    return 'file'
  }

  // A topo edit that moved no column of its own (a photo added, the order changed) says which it
  // was in `metadata`; one that did move a column arrives with a change row instead.
  if (verb === 'update' && objectType === 'block' && parseTopoChange(metadata) != null) {
    return 'topo'
  }

  if (verb === 'accept' || verb === 'invite') return 'invitation'
  if (verb === 'join') return 'role'
  if (verb === 'leave') return 'membership'

  return undefined
}

function line(event: EventListItem, change?: EventChangeItem): CardLine {
  const newValue = change?.newValue ?? storedValue(event)

  return {
    actorFk: event.actorFk,
    actorName: event.actorName,
    cleared: change != null && (change.newValue == null || change.newValue.length === 0),
    columnName: change?.columnName ?? columnFor(event),
    createdAt: event.createdAt,
    id: event.id,
    metadata: event.metadata,
    newValue,
    // A change may name a different row than its event does, which is what lets one reorder's
    // three lines each name their own block.
    objectId: change?.objectId ?? event.objectId,
    objectType: change?.objectType ?? event.objectType,
    // What a removal wrote down about itself: the media word, or the address of a withdrawn
    // invitation. `storedMedia` and the invitation renderers read it here.
    oldValue: change?.oldValue ?? (event.verb === 'remove' ? event.metadata : undefined),
    parentId: event.parent?.id,
    parentType: event.parent?.type,
    regionFk: event.regionFk,
    // The type a logged ascent recorded, which is a column of the ascent rather than of the event,
    // so it is read back off the resolved entity.
    value: event.objectType === 'ascent' && event.verb === 'create' ? event.entity?.ascentType : undefined,
    verb: event.verb,
  }
}

/**
 * What a line shows in its value slot when no change row carries one.
 *
 * An invitation names an address the invitee has no account for, and a claimed first ascent names
 * the identity that was claimed. Both live in `metadata`, and both are rendered from the value
 * rather than from a resolved entity, because there is no entity to resolve.
 */
function storedValue(event: EventListItem): string | undefined {
  if (event.verb === 'invite' || event.verb === 'accept') {
    return event.metadata
  }

  return event.verb === 'add' && event.objectType === 'user' ? event.metadata : undefined
}
