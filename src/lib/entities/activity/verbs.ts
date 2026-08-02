import type { MessageKey } from '$lib/i18n/message'
import type { ActivityEntityType, ActivityListItem, ActivityType } from './dto'

/** One entry in the catalogue: a triple the mutation layer writes, and the sentence it says. */
export interface ActivityVerb {
  /** The column that changed, on the rows that name one. */
  columnName?: string
  entityType: ActivityEntityType
  /** The paraglide key, written out so `tsc` checks it against the compiled catalogue. */
  key: MessageKey
  /** A new ascent scopes its verb by the ascent type it stores here, not by a column. */
  newValue?: string
  type: ActivityType
}

/**
 * Every `(entityType, type, columnName)` triple the mutation layer writes today, read off the
 * `insertActivity` / `createUpdateActivity` call sites, paired with the message it renders as.
 *
 * The keys are literals rather than a composed `activity_${entityType}${capitalize(type)}...`
 * string, and that is the point of the file: a composed key is a `string` all the way to the
 * screen, so a message that was never written (or was renamed, or dropped) only shows up as
 * its own key printed on a card. Spelled out, the same mistake is a type error, because
 * `MessageKey` is the union of what paraglide actually compiled.
 *
 * Add a row here when a mutation starts writing a new triple. `verbs.test.ts` then holds it
 * against the ascent enum and the field registry, and the wording story grows a card for it.
 */
export const ACTIVITY_VERBS: ActivityVerb[] = [
  { entityType: 'area', key: 'activity_areaCreated', type: 'created' },
  { columnName: 'description', entityType: 'area', key: 'activity_areaUpdatedDescription', type: 'updated' },
  { columnName: 'name', entityType: 'area', key: 'activity_areaUpdatedName', type: 'updated' },
  { columnName: 'parking location', entityType: 'area', key: 'activity_areaUpdatedParkingLocation', type: 'updated' },
  {
    columnName: 'parking location',
    entityType: 'area',
    key: 'activity_areaDeletedParkingLocation',
    type: 'deleted',
  },
  { entityType: 'area', key: 'activity_areaDeleted', type: 'deleted' },

  { entityType: 'block', key: 'activity_blockCreated', type: 'created' },
  { columnName: 'location', entityType: 'block', key: 'activity_blockUpdatedLocation', type: 'updated' },
  { columnName: 'location', entityType: 'block', key: 'activity_blockDeletedLocation', type: 'deleted' },
  { columnName: 'name', entityType: 'block', key: 'activity_blockUpdatedName', type: 'updated' },
  { columnName: 'topo', entityType: 'block', key: 'activity_blockUpdatedTopo', type: 'updated' },
  { entityType: 'block', key: 'activity_blockDeleted', type: 'deleted' },

  { entityType: 'route', key: 'activity_routeCreated', type: 'created' },
  { columnName: 'description', entityType: 'route', key: 'activity_routeUpdatedDescription', type: 'updated' },
  {
    columnName: 'firstAscensionists',
    entityType: 'route',
    key: 'activity_routeUpdatedFirstAscensionists',
    type: 'updated',
  },
  { columnName: 'firstAscentYear', entityType: 'route', key: 'activity_routeUpdatedFirstAscentYear', type: 'updated' },
  { columnName: 'gradeFk', entityType: 'route', key: 'activity_routeUpdatedGradeFk', type: 'updated' },
  { columnName: 'name', entityType: 'route', key: 'activity_routeUpdatedName', type: 'updated' },
  { columnName: 'rating', entityType: 'route', key: 'activity_routeUpdatedRating', type: 'updated' },
  { columnName: 'tags', entityType: 'route', key: 'activity_routeUpdatedTags', type: 'updated' },
  { entityType: 'route', key: 'activity_routeDeleted', type: 'deleted' },

  { entityType: 'ascent', key: 'activity_ascentCreatedAttempt', newValue: 'attempt', type: 'created' },
  { entityType: 'ascent', key: 'activity_ascentCreatedFlash', newValue: 'flash', type: 'created' },
  { entityType: 'ascent', key: 'activity_ascentCreatedRedpoint', newValue: 'redpoint', type: 'created' },
  { entityType: 'ascent', key: 'activity_ascentCreatedRepeat', newValue: 'repeat', type: 'created' },
  // An ascent's columns share one sentence: "edited the ascent of X" reads the same whether the
  // grade or the humidity moved, and the expanded half names the column anyway.
  { columnName: 'dateTime', entityType: 'ascent', key: 'activity_ascentUpdated', type: 'updated' },
  { columnName: 'gradeFk', entityType: 'ascent', key: 'activity_ascentUpdated', type: 'updated' },
  { columnName: 'humidity', entityType: 'ascent', key: 'activity_ascentUpdated', type: 'updated' },
  { columnName: 'notes', entityType: 'ascent', key: 'activity_ascentUpdated', type: 'updated' },
  { columnName: 'rating', entityType: 'ascent', key: 'activity_ascentUpdated', type: 'updated' },
  { columnName: 'temperature', entityType: 'ascent', key: 'activity_ascentUpdated', type: 'updated' },
  { columnName: 'type', entityType: 'ascent', key: 'activity_ascentUpdated', type: 'updated' },
  { entityType: 'ascent', key: 'activity_ascentDeleted', type: 'deleted' },

  // Uploads point at the file and name what it was attached to as the parent; deletes are the
  // other way round, because by then the file is gone and only the parent is left to name.
  { entityType: 'file', key: 'activity_fileUploaded', type: 'uploaded' },
  { columnName: 'file', entityType: 'area', key: 'activity_areaDeletedFile', type: 'deleted' },
  { columnName: 'file', entityType: 'ascent', key: 'activity_ascentDeletedFile', type: 'deleted' },
  { columnName: 'file', entityType: 'block', key: 'activity_blockDeletedFile', type: 'deleted' },
  { columnName: 'file', entityType: 'route', key: 'activity_routeDeletedFile', type: 'deleted' },

  {
    columnName: 'first ascensionist',
    entityType: 'user',
    key: 'activity_userUpdatedFirstAscensionist',
    type: 'updated',
  },
  { columnName: 'invitation', entityType: 'user', key: 'activity_userCreatedInvitation', type: 'created' },
  { columnName: 'invitation', entityType: 'user', key: 'activity_userUpdatedInvitation', type: 'updated' },
  { columnName: 'invitation', entityType: 'user', key: 'activity_userDeletedInvitation', type: 'deleted' },
  { columnName: 'role', entityType: 'user', key: 'activity_userUpdatedRole', type: 'updated' },
  { columnName: 'role', entityType: 'user', key: 'activity_userDeletedRole', type: 'deleted' },
  { columnName: 'username', entityType: 'user', key: 'activity_userUpdatedUsername', type: 'updated' },
]

/** The triples above without their wording, for the drift guards and the wording catalogue. */
export const WRITTEN_ACTIVITIES: Partial<ActivityListItem>[] = ACTIVITY_VERBS.map(
  ({ key: _key, ...written }) => written,
)

/**
 * What a row whose column has no entry above degrades to: still true, just vaguer. Only
 * reachable for a column this app no longer writes, since a live one is a row in the
 * catalogue and a missing message is a type error.
 *
 * `deleted` has no entries on purpose. There the column-less verb says the entity itself is
 * gone, so degrading a removed photo to "deleted the route" would be a lie rather than a
 * vaguer truth. Those fall straight through to {@link GENERIC}.
 */
const DEGRADED: Partial<Record<`${ActivityEntityType}:${ActivityType}`, MessageKey>> = {
  'area:updated': 'activity_areaUpdated',
  'ascent:created': 'activity_ascentCreated',
  'ascent:updated': 'activity_ascentUpdated',
  'block:updated': 'activity_blockUpdated',
  'route:updated': 'activity_routeUpdated',
}

/** True of any row whatsoever, which is all that is left to say about one nothing above matches. */
const GENERIC: MessageKey = 'activity_genericChange'

const BY_ID = new Map(ACTIVITY_VERBS.map((verb) => [verbId(verb), verb.key]))

/**
 * The sentence a row renders as: its catalogue entry, the vaguer verb for its entity, or the
 * generic one. Always a key paraglide has, so nothing can print itself onto a card.
 *
 * Takes only the four fields that pick a verb, so a catalogue entry can be passed straight
 * back in (`verbs.test.ts` does, to prove every entry is reachable).
 */
export function activityVerb(activity: Omit<ActivityVerb, 'key'>): MessageKey {
  const exact = BY_ID.get(verbId(activity))
  if (exact != null) {
    return exact
  }

  return (activity.type === 'deleted' ? undefined : DEGRADED[`${activity.entityType}:${activity.type}`]) ?? GENERIC
}

/** Built the same way for the catalogue and for a row, so the two can only match or both fail. */
function verbId(verb: Omit<ActivityVerb, 'key'>): string {
  const scope = verb.entityType === 'ascent' && verb.type === 'created' ? verb.newValue : verb.columnName
  return scope == null ? `${verb.entityType}:${verb.type}` : `${verb.entityType}:${verb.type}:${scope}`
}
