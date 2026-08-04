import type { IconName } from '$lib/components/Icon/icons'
import type { MessageKey } from '$lib/i18n/message'
import type { ActivityEntityType, ActivityListItem, ActivityType } from './dto'

/** The label, icon and diff renderer for one changed column. */
export interface ActivityField {
  icon: IconName
  labelKey: MessageKey
  renderer: ChangeRenderer
}

/** How the expanded change list renders a column's old/new pair. */
export type ChangeRenderer =
  | 'chips'
  | 'file'
  | 'grade'
  | 'location'
  | 'locationRemoved'
  | 'prose'
  | 'rating'
  | 'source'
  | 'tags'
  | 'text'
  | 'topo'

/**
 * The field metadata entries share, hoisted so `en` and `de` cannot drift per screen.
 *
 * Referenced from the entries below rather than keyed by column name. That key was a level
 * too coarse: it could not tell a location that was set from one that was cleared, and it
 * gave `role` one entry across every entity and change type that names that column.
 */
const FIELD = {
  dateTime: { icon: 'history', labelKey: 'activity_fieldDateTime', renderer: 'text' },
  description: { icon: 'file-text', labelKey: 'activity_fieldDescription', renderer: 'prose' },
  file: { icon: 'image', labelKey: 'activity_fieldFile', renderer: 'file' },
  firstAscensionist: { icon: 'user', labelKey: 'activity_fieldFirstAscensionist', renderer: 'text' },
  firstAscensionists: { icon: 'users', labelKey: 'activity_fieldFirstAscensionists', renderer: 'chips' },
  firstAscentYear: { icon: 'history', labelKey: 'activity_fieldFirstAscentYear', renderer: 'text' },
  grade: { icon: 'trending-up', labelKey: 'activity_fieldGrade', renderer: 'grade' },
  humidity: { icon: 'info', labelKey: 'activity_fieldHumidity', renderer: 'text' },
  location: { icon: 'map-pin', labelKey: 'activity_fieldLocation', renderer: 'location' },
  /** A cleared pin, which the shared `location` renderer would announce as an update. */
  locationGone: { icon: 'map-pin', labelKey: 'activity_fieldLocation', renderer: 'locationRemoved' },
  name: { icon: 'edit', labelKey: 'activity_fieldName', renderer: 'text' },
  notes: { icon: 'file-text', labelKey: 'activity_fieldNotes', renderer: 'prose' },
  parkingLocation: { icon: 'parking', labelKey: 'activity_fieldParkingLocation', renderer: 'location' },
  parkingLocationGone: { icon: 'parking', labelKey: 'activity_fieldParkingLocation', renderer: 'locationRemoved' },
  rating: { icon: 'star', labelKey: 'activity_fieldRating', renderer: 'rating' },
  role: { icon: 'users-round', labelKey: 'activity_fieldRole', renderer: 'text' },
  /** A video's origin URL. Its own renderer because the stored value is a whole URL and a
   *  reader only wants the host it was reposted from. */
  source: { icon: 'link', labelKey: 'activity_fieldSource', renderer: 'source' },
  tags: { icon: 'bookmark', labelKey: 'activity_fieldTags', renderer: 'tags' },
  temperature: { icon: 'info', labelKey: 'activity_fieldTemperature', renderer: 'text' },
  topo: { icon: 'route', labelKey: 'activity_fieldTopo', renderer: 'topo' },
  type: { icon: 'pickaxe', labelKey: 'activity_fieldType', renderer: 'text' },
  username: { icon: 'user', labelKey: 'activity_fieldUsername', renderer: 'text' },
} as const satisfies Record<string, ActivityField>

/**
 * One entry in the catalogue: a triple the mutation layer writes, and everything the feed
 * decides from it. Only the triple half is spellable by a writer (see {@link DeclaredActivity});
 * the rest is presentation.
 */
export interface ActivityVerb {
  /** The column that changed, on the rows that name one. */
  columnName?: string
  entityType: ActivityEntityType
  /**
   * How the expanded half renders this row's old/new pair. Absent means the row carries no
   * pair worth showing, which is a fact about the event and not about the column: a role
   * change has one, a member removal writes the same column and has none.
   */
  field?: ActivityField
  /** The paraglide key, written out so `tsc` checks it against the compiled catalogue. */
  key: MessageKey
  /**
   * Where the headline's `{name}` comes from, when it is not the hydrated subject.
   *
   * `stored` means the subject is not a hydratable ref at all: an invitation names an address
   * and the invitee has no `users` row, so `entityId` points at the inviter and hydrating it
   * would render "Jonas invited Jonas". `parent` means the row's own subject is never the
   * thing named: an upload points at a file whose name is a cuid.
   */
  names?: 'parent' | 'stored'
  /** A new ascent scopes its verb by the ascent type it stores here, not by a column. */
  newValue?: string
  /** Whether the card shows an ascent status glyph, read off `newValue`. */
  status?: 'ascentType'
  /** Which value column carries the name once the subject is gone. */
  tombstone?: 'newValue' | 'oldValue'
  type: ActivityType
}

/**
 * Every `(entityType, type, columnName)` triple the mutation layer writes today, read off the
 * `insertActivity` / `createUpdateActivity` call sites, paired with everything the feed says
 * about it.
 *
 * The keys are literals rather than a composed `activity_${entityType}${capitalize(type)}...`
 * string, and that is the point of the file: a composed key is a `string` all the way to the
 * screen, so a message that was never written (or was renamed, or dropped) only shows up as
 * its own key printed on a card. Spelled out, the same mistake is a type error, because
 * `MessageKey` is the union of what paraglide actually compiled.
 *
 * Add a row here when a mutation starts writing a new triple. Until you do, the mutation does
 * not compile: `insertActivity` and `createUpdateActivity` take their parameter type from
 * this list.
 */
export const ACTIVITY_VERBS = [
  { entityType: 'area', key: 'activity_areaCreated', tombstone: 'newValue', type: 'created' },
  {
    columnName: 'description',
    entityType: 'area',
    field: FIELD.description,
    key: 'activity_areaUpdatedDescription',
    type: 'updated',
  },
  {
    columnName: 'name',
    entityType: 'area',
    field: FIELD.name,
    key: 'activity_areaUpdatedName',
    tombstone: 'newValue',
    type: 'updated',
  },
  {
    columnName: 'parking location',
    entityType: 'area',
    field: FIELD.parkingLocation,
    key: 'activity_areaUpdatedParkingLocation',
    type: 'updated',
  },
  {
    columnName: 'parking location',
    entityType: 'area',
    field: FIELD.parkingLocationGone,
    key: 'activity_areaDeletedParkingLocation',
    type: 'deleted',
  },
  { entityType: 'area', key: 'activity_areaDeleted', tombstone: 'oldValue', type: 'deleted' },

  {
    entityType: 'block',
    key: 'activity_blockCreated',
    tombstone: 'newValue',
    type: 'created',
  },
  {
    columnName: 'location',
    entityType: 'block',
    field: FIELD.location,
    key: 'activity_blockUpdatedLocation',
    type: 'updated',
  },
  {
    columnName: 'location',
    entityType: 'block',
    field: FIELD.locationGone,
    key: 'activity_blockDeletedLocation',
    type: 'deleted',
  },
  {
    columnName: 'name',
    entityType: 'block',
    field: FIELD.name,
    key: 'activity_blockUpdatedName',
    tombstone: 'newValue',
    type: 'updated',
  },
  { columnName: 'topo', entityType: 'block', field: FIELD.topo, key: 'activity_blockUpdatedTopo', type: 'updated' },
  // A pulled photo is its own sentence, the way a cleared pin is: "updated the topo" for a
  // deletion is true only in the sense that everything is an update.
  { columnName: 'topo', entityType: 'block', field: FIELD.topo, key: 'activity_blockDeletedTopo', type: 'deleted' },
  { entityType: 'block', key: 'activity_blockDeleted', tombstone: 'oldValue', type: 'deleted' },

  { entityType: 'route', key: 'activity_routeCreated', tombstone: 'newValue', type: 'created' },
  {
    columnName: 'description',
    entityType: 'route',
    field: FIELD.description,
    key: 'activity_routeUpdatedDescription',
    type: 'updated',
  },
  {
    columnName: 'firstAscensionists',
    entityType: 'route',
    field: FIELD.firstAscensionists,
    key: 'activity_routeUpdatedFirstAscensionists',
    type: 'updated',
  },
  {
    columnName: 'firstAscentYear',
    entityType: 'route',
    field: FIELD.firstAscentYear,
    key: 'activity_routeUpdatedFirstAscentYear',
    type: 'updated',
  },
  {
    columnName: 'gradeFk',
    entityType: 'route',
    field: FIELD.grade,
    key: 'activity_routeUpdatedGradeFk',
    type: 'updated',
  },
  {
    columnName: 'name',
    entityType: 'route',
    field: FIELD.name,
    key: 'activity_routeUpdatedName',
    tombstone: 'newValue',
    type: 'updated',
  },
  {
    columnName: 'rating',
    entityType: 'route',
    field: FIELD.rating,
    key: 'activity_routeUpdatedRating',
    type: 'updated',
  },
  { columnName: 'tags', entityType: 'route', field: FIELD.tags, key: 'activity_routeUpdatedTags', type: 'updated' },
  { entityType: 'route', key: 'activity_routeDeleted', tombstone: 'oldValue', type: 'deleted' },

  // A new ascent's value column holds its ascent type, never a name, so no `tombstone`: a
  // deleted ascent's card says "an ascent" rather than borrowing "redpoint" as one.
  {
    entityType: 'ascent',
    key: 'activity_ascentCreatedAttempt',
    newValue: 'attempt',
    status: 'ascentType',
    type: 'created',
  },
  {
    entityType: 'ascent',
    key: 'activity_ascentCreatedFlash',
    newValue: 'flash',
    status: 'ascentType',
    type: 'created',
  },
  {
    entityType: 'ascent',
    key: 'activity_ascentCreatedRedpoint',
    newValue: 'redpoint',
    status: 'ascentType',
    type: 'created',
  },
  {
    entityType: 'ascent',
    key: 'activity_ascentCreatedRepeat',
    newValue: 'repeat',
    status: 'ascentType',
    type: 'created',
  },
  // An ascent's columns share one sentence: "edited the ascent of X" reads the same whether the
  // grade or the humidity moved, and the expanded half names the column anyway.
  {
    columnName: 'dateTime',
    entityType: 'ascent',
    field: FIELD.dateTime,
    key: 'activity_ascentUpdated',
    type: 'updated',
  },
  { columnName: 'gradeFk', entityType: 'ascent', field: FIELD.grade, key: 'activity_ascentUpdated', type: 'updated' },
  {
    columnName: 'humidity',
    entityType: 'ascent',
    field: FIELD.humidity,
    key: 'activity_ascentUpdated',
    type: 'updated',
  },
  { columnName: 'notes', entityType: 'ascent', field: FIELD.notes, key: 'activity_ascentUpdated', type: 'updated' },
  { columnName: 'rating', entityType: 'ascent', field: FIELD.rating, key: 'activity_ascentUpdated', type: 'updated' },
  {
    columnName: 'temperature',
    entityType: 'ascent',
    field: FIELD.temperature,
    key: 'activity_ascentUpdated',
    type: 'updated',
  },
  { columnName: 'type', entityType: 'ascent', field: FIELD.type, key: 'activity_ascentUpdated', type: 'updated' },
  { entityType: 'ascent', key: 'activity_ascentDeleted', type: 'deleted' },

  // Uploads point at the file and name what it was attached to as the parent; deletes are the
  // other way round, because by then the file is gone and only the parent is left to name.
  { entityType: 'file', key: 'activity_fileUploaded', names: 'parent', type: 'uploaded' },
  // A source edit points at the file too, so the card can draw the clip it is about, and
  // borrows the same parent name: the file's own is a cuid either way.
  {
    columnName: 'source',
    entityType: 'file',
    field: FIELD.source,
    key: 'activity_fileUpdatedSource',
    names: 'parent',
    type: 'updated',
  },
  {
    columnName: 'file',
    entityType: 'area',
    field: FIELD.file,
    key: 'activity_areaDeletedFile',
    type: 'deleted',
  },
  {
    columnName: 'file',
    entityType: 'ascent',
    field: FIELD.file,
    key: 'activity_ascentDeletedFile',
    type: 'deleted',
  },
  {
    columnName: 'file',
    entityType: 'block',
    field: FIELD.file,
    key: 'activity_blockDeletedFile',
    type: 'deleted',
  },
  {
    columnName: 'file',
    entityType: 'route',
    field: FIELD.file,
    key: 'activity_routeDeletedFile',
    type: 'deleted',
  },

  {
    columnName: 'first ascensionist',
    entityType: 'user',
    field: FIELD.firstAscensionist,
    key: 'activity_userUpdatedFirstAscensionist',
    tombstone: 'newValue',
    type: 'updated',
  },
  // The three invitation rows name an address the invitee has no account for, and point
  // `entityId` at the inviter. `names: 'stored'` is what keeps hydration off that person.
  // No `field` either: the headline already is the address, so a change line would repeat it.
  {
    columnName: 'invitation',
    entityType: 'user',
    key: 'activity_userCreatedInvitation',
    names: 'stored',
    type: 'created',
  },
  {
    columnName: 'invitation',
    entityType: 'user',
    key: 'activity_userUpdatedInvitation',
    names: 'stored',
    type: 'updated',
  },
  {
    columnName: 'invitation',
    entityType: 'user',
    key: 'activity_userDeletedInvitation',
    names: 'stored',
    type: 'deleted',
  },
  {
    columnName: 'role',
    entityType: 'user',
    field: FIELD.role,
    key: 'activity_userUpdatedRole',
    tombstone: 'newValue',
    type: 'updated',
  },
  // No `field`: a removal stores no old/new pair, and the shared-by-column registry used to
  // give it one anyway, rendering "Role: maintainer to Not set" under "removed from the region".
  {
    columnName: 'role',
    entityType: 'user',
    key: 'activity_userDeletedRole',
    tombstone: 'newValue',
    type: 'deleted',
  },
  // Leaving is its own event. It shared `role` with being removed until migration 0094, which
  // is why the feed used to say "Mara removed Mara from the region". No `tombstone`: the
  // sentence names only the actor, who is also the subject.
  { columnName: 'membership', entityType: 'user', key: 'activity_userDeletedMembership', type: 'deleted' },
  {
    columnName: 'username',
    entityType: 'user',
    field: FIELD.username,
    key: 'activity_userUpdatedUsername',
    tombstone: 'newValue',
    type: 'updated',
  },
] as const satisfies readonly ActivityVerb[]

/**
 * The triples above without their presentation, for the drift guards and the wording catalogue.
 *
 * Widened first: only some `as const` members declare the presentation fields, and a union
 * cannot be destructured on a key its every member does not have.
 */
export const WRITTEN_ACTIVITIES: Partial<ActivityListItem>[] = (ACTIVITY_VERBS as readonly ActivityVerb[]).map(
  ({ field: _field, key: _key, names: _names, status: _status, tombstone: _tombstone, ...written }) => written,
)

/** What a mutation may write: one member per catalogue entry, literals intact. */
export type DeclaredActivity = Triple<(typeof ACTIVITY_VERBS)[number]>

/** The columns declared for `<entityType> updated`, which is what a column diff may emit. */
export type DeclaredColumn<E extends ActivityEntityType> = Extract<
  (typeof ACTIVITY_VERBS)[number],
  { columnName: string; entityType: E; type: 'updated' }
>['columnName']

/**
 * The half of an entry a mutation may spell. Everything else on the entry is presentation,
 * which a writer must not be able to set.
 *
 * `newValue` is excluded on purpose. Four entries pin it to a literal ascent type, and
 * `createAscent` passes the whole `AscentType` union, which is assignable to none of them
 * individually. The enum stays guarded by the round trip in `verbs.test.ts` instead.
 */
type Presentation = 'field' | 'key' | 'names' | 'newValue' | 'status' | 'tombstone'

/**
 * Distributes over the union, and gives an entry that declares no column an explicit
 * `columnName?: undefined`.
 *
 * Both halves are load-bearing. A non-distributive `Omit<ActivityVerb, Presentation>` would
 * collapse the union to `{ entityType, type }` over the full enums and check nothing at all.
 * And without the `undefined` arm, excess property checking waves a bogus `columnName`
 * through, because for a union target it only asks whether SOME member declares that key.
 */
type Triple<T> = T extends { columnName: string }
  ? Omit<T, Presentation>
  : Omit<T, Presentation> & { columnName?: undefined }

/**
 * What a row whose triple has no entry above degrades to: still true, just vaguer. Only
 * reachable for a triple this app no longer writes, since a live one is a row in the
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

/**
 * Entities whose `newValue` scopes the verb rather than a column. Derived from the entries
 * that declare one, so a second value-scoped family needs no change here.
 *
 * Declared above {@link BY_ID}, which builds its keys through `verbId` at module load: as a
 * `const` this sits in the temporal dead zone until its own line runs.
 */
const VALUE_SCOPED = new Set<string>(
  ACTIVITY_VERBS.filter((verb) => 'newValue' in verb).map((verb) => `${verb.entityType}:${verb.type}`),
)

/** The index holds the whole entry, so the sentence, the field, the name slot and the status
 *  glyph all come out of one lookup instead of four re-derivations. */
const BY_ID = new Map<string, ActivityVerb>(ACTIVITY_VERBS.map((verb) => [verbId(verb), verb]))

/**
 * The fields that pick an entry. Both a stored row and a catalogue entry satisfy it, which is
 * how `verbs.test.ts` can feed the catalogue back in to prove every entry is reachable.
 */
export type VerbLookup = Partial<Pick<ActivityVerb, 'columnName' | 'newValue'>> &
  Pick<ActivityVerb, 'entityType' | 'type'>

/**
 * The catalogue entry a stored row matches, or `undefined` for a row no writer can emit.
 *
 * Deliberately takes the wide shape rather than {@link DeclaredActivity}: it reads stored
 * rows, including legacy ones like `route:updated:retired` that no current writer produces
 * and that DEGRADED and GENERIC exist for. Narrow seam for writing, wide seam for reading.
 */
export function activityEntry(activity: VerbLookup): ActivityVerb | undefined {
  return BY_ID.get(verbId(activity))
}

/**
 * The sentence a row renders as: its catalogue entry, the vaguer verb for its entity, or the
 * generic one. Always a key paraglide has, so nothing can print itself onto a card.
 */
export function activityVerb(activity: VerbLookup): MessageKey {
  return (
    activityEntry(activity)?.key ??
    (activity.type === 'deleted' ? undefined : DEGRADED[`${activity.entityType}:${activity.type}`]) ??
    GENERIC
  )
}

/** Built the same way for the catalogue and for a row, so the two can only match or both fail. */
function verbId(verb: VerbLookup): string {
  const scope = VALUE_SCOPED.has(`${verb.entityType}:${verb.type}`) ? verb.newValue : verb.columnName
  return scope == null ? `${verb.entityType}:${verb.type}` : `${verb.entityType}:${verb.type}:${scope}`
}
