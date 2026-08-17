import type { IconName } from '$lib/components/Icon/icons'
import type { MessageKey } from '$lib/i18n/message'
import type { ChangeKind, PairFormat } from './change'
import type { EventObjectType } from './dto'
import type { EventVerb } from './mapper'

/**
 * Whose ascent a deletion took, as its row recorded it.
 *
 * An ascent is hard-deleted, and the activity row is written in the same transaction, so by the
 * time any reader sees the card there is nothing left to ask who climbed it. Without this the
 * card can only say "removed an ascent of Rampe", which is the one thing a maintainer clearing
 * up somebody else's log must not say. Same reasoning as the name an area delete stashes in
 * `oldValue`: write down what is about to stop being knowable.
 *
 * The name travels with the id because the id alone would need a user lookup the feed does not
 * otherwise do for a row whose subject is gone.
 */
export interface DeletedAscentClimber {
  climberFk: number
  climberName: string
}

/**
 * What a whole-entity deletion took with it, as its row stores it.
 *
 * A deletion is the one card whose subject a reader cannot go and look at, so the scale of it
 * has to be written down while it is still knowable. Counts only: the card says "12 blocks,
 * 200 routes", never a list, because a list of things that no longer exist is not navigable.
 *
 * Rows written before this carry no metadata and render exactly as they always did.
 */
export interface DeletionScale {
  areas?: number
  blocks?: number
  routes?: number
}

/**
 * The label, icon and change-line shape for one changed column.
 *
 * The shape is declared here rather than mapped somewhere else, so a column states how it
 * renders where it states what it is called. `change.ts` reads this and needs no table of its
 * own; a shape it does not handle is a compile error rather than a silently plain-text row.
 */
export interface VerbField {
  /** Only on `location`: the pin was cleared rather than moved. The shared caption ladder
   *  would otherwise announce a removal as an update, and an approach path would be drawn to
   *  a parking spot nobody can park at any more. */
  cleared?: true
  /** Only on `pair`: which formatter the two chips read through. */
  format?: PairFormat
  icon: IconName
  kind: ChangeKind
  labelKey: MessageKey
}

export function parseDeletedAscent(metadata: string | undefined): DeletedAscentClimber | undefined {
  if (metadata == null || metadata.length === 0) {
    return undefined
  }

  try {
    const parsed: unknown = JSON.parse(metadata)
    if (typeof parsed !== 'object' || parsed == null) {
      return undefined
    }

    const { climberFk, climberName } = parsed as Record<string, unknown>
    return typeof climberFk === 'number' && Number.isFinite(climberFk) && typeof climberName === 'string'
      ? { climberFk, climberName }
      : undefined
  } catch {
    // Shares the column with topo metadata, which is not JSON. Not ours, so not a climber.
    return undefined
  }
}

export function parseDeletionScale(metadata: string | undefined): DeletionScale | undefined {
  if (metadata == null || metadata.length === 0) {
    return undefined
  }

  try {
    const parsed: unknown = JSON.parse(metadata)
    if (typeof parsed !== 'object' || parsed == null) {
      return undefined
    }

    // Each count checked rather than cast: the card adds these up, and `+=` on a string that
    // came out of JSON concatenates instead of adding ("09 routes"). The column is shared with
    // rows this code did not write, so what it holds is not this code's to assume.
    const raw = parsed as Record<string, unknown>
    const counted = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
    const scale: DeletionScale = {
      areas: counted(raw.areas),
      blocks: counted(raw.blocks),
      routes: counted(raw.routes),
    }
    return scale.areas == null && scale.blocks == null && scale.routes == null ? undefined : scale
  } catch {
    // A topo row's metadata sits in the same column and is not JSON. Not ours, so not a scale.
    return undefined
  }
}

export function stringifyDeletedAscent(climber: DeletedAscentClimber): string {
  return JSON.stringify(climber)
}

/** Only the non-zero counts, so an empty crag stores nothing rather than a row of zeroes. */
export function stringifyDeletionScale(scale: DeletionScale): string | undefined {
  const entries = Object.entries(scale).filter(([, value]) => typeof value === 'number' && value > 0)
  return entries.length === 0 ? undefined : JSON.stringify(Object.fromEntries(entries))
}

/**
 * The field metadata entries share, hoisted so `en` and `de` cannot drift per screen.
 *
 * Referenced from the entries below rather than keyed by column name. That key was a level
 * too coarse: it could not tell a location that was set from one that was cleared, and it
 * gave `role` one entry across every entity and change type that names that column.
 */
const FIELD = {
  dateTime: { format: 'date', icon: 'history', kind: 'pair', labelKey: 'event_fieldDateTime' },
  description: { icon: 'file-text', kind: 'prose', labelKey: 'event_fieldDescription' },
  file: { icon: 'image', kind: 'file', labelKey: 'event_fieldFile' },
  firstAscensionist: { format: 'text', icon: 'user', kind: 'pair', labelKey: 'event_fieldFirstAscensionist' },
  firstAscensionists: { icon: 'users', kind: 'chips', labelKey: 'event_fieldFirstAscensionists' },
  firstAscentYear: { format: 'text', icon: 'history', kind: 'pair', labelKey: 'event_fieldFirstAscentYear' },
  grade: { icon: 'trending-up', kind: 'grade', labelKey: 'event_fieldGrade' },
  humidity: { format: 'humidity', icon: 'info', kind: 'pair', labelKey: 'event_fieldHumidity' },
  location: { icon: 'map-pin', kind: 'location', labelKey: 'event_fieldLocation' },
  /** A cleared pin. See {@link VerbField.cleared}. */
  locationGone: { cleared: true, icon: 'map-pin', kind: 'location', labelKey: 'event_fieldLocation' },
  name: { format: 'text', icon: 'edit', kind: 'pair', labelKey: 'event_fieldName' },
  notes: { icon: 'file-text', kind: 'prose', labelKey: 'event_fieldNotes' },
  parkingLocation: { icon: 'parking', kind: 'location', labelKey: 'event_fieldParkingLocation' },
  parkingLocationGone: { cleared: true, icon: 'parking', kind: 'location', labelKey: 'event_fieldParkingLocation' },
  rating: { icon: 'star', kind: 'rating', labelKey: 'event_fieldRating' },
  /** The stored value is the `region_*` enum member, which is a database detail. Its own
   *  format so the chips read Admin, Maintainer and User like the member list does. */
  role: { format: 'role', icon: 'users-round', kind: 'pair', labelKey: 'event_fieldRole' },
  /** A video's origin URL. Its own kind because the stored value is a whole URL and a reader
   *  only wants the host it was reposted from. */
  source: { icon: 'link', kind: 'source', labelKey: 'event_fieldSource' },
  tags: { icon: 'bookmark', kind: 'tags', labelKey: 'event_fieldTags' },
  temperature: { format: 'temperature', icon: 'info', kind: 'pair', labelKey: 'event_fieldTemperature' },
  topo: { icon: 'route', kind: 'topo', labelKey: 'event_fieldTopo' },
  /** Its own kind, not a text pair: the stored member (`redpoint`) is neither localised nor
   *  what the rest of the app shows for it, and a card whose row already carries the glyph
   *  read "attempt to redpoint" in English under a German headline. */
  type: { icon: 'pickaxe', kind: 'ascentType', labelKey: 'event_fieldType' },
  username: { format: 'text', icon: 'user', kind: 'pair', labelKey: 'event_fieldUsername' },
} as const satisfies Record<string, VerbField>

/**
 * One entry in the catalogue: a triple the mutation layer writes, and everything the feed
 * decides from it. Only the triple half is spellable by a writer (see {@link DeclaredRow});
 * the rest is presentation.
 */
export interface VerbEntry {
  /**
   * Whether this entry is the one for CLEARING the column rather than setting it.
   *
   * One entry needs it: a block's pin. Removing a pin is written as an update whose value went
   * away, not as its own verb, and "updated the location" on a block that no longer has one reads
   * as still pinned. Every other cleared column has a verb of its own.
   */
  cleared?: true
  /** The column that changed, on the entries that name one. */
  columnName?: string
  /**
   * How the expanded half renders this row's old/new pair. Absent means the row carries no
   * pair worth showing, which is a fact about the event and not about the column: a role
   * change has one, a member removal writes the same column and has none.
   */
  field?: VerbField
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
  objectType: EventObjectType
  /**
   * Whether the card renders an entity row for the subject at all.
   *
   * `none` is for the events whose subject is no longer there to link to. A removed member is
   * not in the region any more, so a row offering their profile is a dead end, and the row
   * would sit there pulsing for anyone whose member list no longer holds them. The headline
   * still names them, which is why this is not `names: 'stored'`: the entity is fetched, it
   * just is not rendered.
   */
  row?: 'none'
  /** Whether the card shows an ascent status glyph, read off `newValue`. */
  status?: 'ascentType'
  /** Which value carries the name once the subject is gone. */
  tombstone?: 'newValue' | 'oldValue'
  /** A new ascent scopes its entry by the ascent type rather than by a column. */
  value?: string
  verb: EventVerb
}

/**
 * Every `(objectType, verb, columnName)` an event can carry, read off the
 * `insertEvent` call sites, paired with everything the feed says
 * about it.
 *
 * The message keys are literals rather than a composed `event_${objectType}${capitalize(verb)}...`
 * string, and that is the point of the file: a composed key is a `string` all the way to the
 * screen, so a message that was never written (or was renamed, or dropped) only shows up as
 * its own key printed on a card. Spelled out, the same mistake is a type error, because
 * `MessageKey` is the union of what paraglide actually compiled.
 *
 * Add a row here when a writer starts producing a new triple. What guarantees a triple resolves is
 * `verbs.test.ts`, which feeds the whole catalogue back through the lookup, plus
 * `cases/coverage.test.ts`, which reads every write site in the app and fails when one has no card.
 */
export const VERBS = [
  { key: 'event_areaCreated', objectType: 'area', tombstone: 'newValue', verb: 'create' },
  {
    columnName: 'description',
    field: FIELD.description,
    key: 'event_areaUpdatedDescription',
    objectType: 'area',
    verb: 'update',
  },
  {
    columnName: 'name',
    field: FIELD.name,
    key: 'event_areaUpdatedName',
    objectType: 'area',
    tombstone: 'newValue',
    verb: 'update',
  },
  {
    columnName: 'parking location',
    field: FIELD.parkingLocation,
    key: 'event_areaUpdatedParkingLocation',
    objectType: 'area',
    verb: 'add',
  },
  // The same sentence for the shape MIGRATED history carries. The live writer emits `add` with the
  // coordinates in metadata; the backfill mapped every `updated` row to the `update` verb whatever
  // its column was, so a pin set before the cutover arrives as an update with a change row. Both
  // are the same action to a reader, and without this the older one falls through to "made a
  // change", which is what this catalogue exists to prevent.
  {
    columnName: 'parking location',
    field: FIELD.parkingLocation,
    key: 'event_areaUpdatedParkingLocation',
    objectType: 'area',
    verb: 'update',
  },
  {
    columnName: 'parking location',
    field: FIELD.parkingLocationGone,
    key: 'event_areaDeletedParkingLocation',
    objectType: 'area',
    verb: 'remove',
  },
  { key: 'event_areaDeleted', objectType: 'area', tombstone: 'oldValue', verb: 'delete' },

  {
    key: 'event_blockCreated',
    objectType: 'block',
    tombstone: 'newValue',
    verb: 'create',
  },
  {
    columnName: 'location',
    field: FIELD.location,
    key: 'event_blockUpdatedLocation',
    objectType: 'block',
    verb: 'update',
  },
  {
    cleared: true,
    columnName: 'location',
    field: FIELD.locationGone,
    key: 'event_blockDeletedLocation',
    objectType: 'block',
    verb: 'update',
  },
  // The same sentence for the shape migrated history carries. The backfill mapped a deleted row
  // WITH a column to `remove`, keeping the coordinates in metadata, so a pin cleared before the
  // cutover arrives as `block:remove:location` rather than as an update whose value went away.
  {
    columnName: 'location',
    field: FIELD.locationGone,
    key: 'event_blockDeletedLocation',
    objectType: 'block',
    verb: 'remove',
  },
  {
    columnName: 'name',
    field: FIELD.name,
    key: 'event_blockUpdatedName',
    objectType: 'block',
    tombstone: 'newValue',
    verb: 'update',
  },
  { columnName: 'topo', field: FIELD.topo, key: 'event_blockUpdatedTopo', objectType: 'block', verb: 'update' },
  // A pulled photo is its own sentence, the way a cleared pin is: "updated the topo" for a
  // deletion is true only in the sense that everything is an update.
  { columnName: 'topo', field: FIELD.topo, key: 'event_blockDeletedTopo', objectType: 'block', verb: 'remove' },
  { key: 'event_blockDeleted', objectType: 'block', tombstone: 'oldValue', verb: 'delete' },

  { key: 'event_routeCreated', objectType: 'route', tombstone: 'newValue', verb: 'create' },
  {
    columnName: 'description',
    field: FIELD.description,
    key: 'event_routeUpdatedDescription',
    objectType: 'route',
    verb: 'update',
  },
  {
    columnName: 'firstAscensionists',
    field: FIELD.firstAscensionists,
    key: 'event_routeUpdatedFirstAscensionists',
    objectType: 'route',
    verb: 'update',
  },
  {
    columnName: 'firstAscentYear',
    field: FIELD.firstAscentYear,
    key: 'event_routeUpdatedFirstAscentYear',
    objectType: 'route',
    verb: 'update',
  },
  {
    columnName: 'gradeFk',
    field: FIELD.grade,
    key: 'event_routeUpdatedGradeFk',
    objectType: 'route',
    verb: 'update',
  },
  {
    columnName: 'name',
    field: FIELD.name,
    key: 'event_routeUpdatedName',
    objectType: 'route',
    tombstone: 'newValue',
    verb: 'update',
  },
  {
    columnName: 'rating',
    field: FIELD.rating,
    key: 'event_routeUpdatedRating',
    objectType: 'route',
    verb: 'update',
  },
  { columnName: 'tags', field: FIELD.tags, key: 'event_routeUpdatedTags', objectType: 'route', verb: 'update' },
  { key: 'event_routeDeleted', objectType: 'route', tombstone: 'oldValue', verb: 'delete' },

  // A new ascent's value column holds its ascent type, never a name, so no `tombstone`: a
  // deleted ascent's card says "an ascent" rather than borrowing "redpoint" as one.
  {
    key: 'event_ascentCreatedAttempt',
    objectType: 'ascent',
    status: 'ascentType',
    value: 'attempt',
    verb: 'create',
  },
  {
    key: 'event_ascentCreatedFlash',
    objectType: 'ascent',
    status: 'ascentType',
    value: 'flash',
    verb: 'create',
  },
  {
    key: 'event_ascentCreatedRedpoint',
    objectType: 'ascent',
    status: 'ascentType',
    value: 'redpoint',
    verb: 'create',
  },
  {
    key: 'event_ascentCreatedRepeat',
    objectType: 'ascent',
    status: 'ascentType',
    value: 'repeat',
    verb: 'create',
  },
  // An ascent's columns share one sentence: "edited the ascent of X" reads the same whether the
  // grade or the humidity moved, and the expanded half names the column anyway.
  {
    columnName: 'dateTime',
    field: FIELD.dateTime,
    key: 'event_ascentUpdated',
    objectType: 'ascent',
    verb: 'update',
  },
  { columnName: 'gradeFk', field: FIELD.grade, key: 'event_ascentUpdated', objectType: 'ascent', verb: 'update' },
  {
    columnName: 'humidity',
    field: FIELD.humidity,
    key: 'event_ascentUpdated',
    objectType: 'ascent',
    verb: 'update',
  },
  { columnName: 'notes', field: FIELD.notes, key: 'event_ascentUpdated', objectType: 'ascent', verb: 'update' },
  { columnName: 'rating', field: FIELD.rating, key: 'event_ascentUpdated', objectType: 'ascent', verb: 'update' },
  {
    columnName: 'temperature',
    field: FIELD.temperature,
    key: 'event_ascentUpdated',
    objectType: 'ascent',
    verb: 'update',
  },
  { columnName: 'type', field: FIELD.type, key: 'event_ascentUpdated', objectType: 'ascent', verb: 'update' },
  { key: 'event_ascentDeleted', objectType: 'ascent', verb: 'delete' },

  // Uploads point at the file and name what it was attached to as the parent; deletes are the
  // other way round, because by then the file is gone and only the parent is left to name.
  { key: 'event_fileUploaded', names: 'parent', objectType: 'file', verb: 'add' },
  // A source edit points at the file too, so the card can draw the clip it is about, and
  // borrows the same parent name: the file's own is a cuid either way.
  {
    columnName: 'source',
    field: FIELD.source,
    key: 'event_fileUpdatedSource',
    names: 'parent',
    objectType: 'file',
    verb: 'update',
  },
  {
    columnName: 'file',
    field: FIELD.file,
    key: 'event_areaDeletedFile',
    objectType: 'area',
    verb: 'remove',
  },
  {
    columnName: 'file',
    field: FIELD.file,
    key: 'event_ascentDeletedFile',
    objectType: 'ascent',
    verb: 'remove',
  },
  {
    columnName: 'file',
    field: FIELD.file,
    key: 'event_blockDeletedFile',
    objectType: 'block',
    verb: 'remove',
  },
  {
    columnName: 'file',
    field: FIELD.file,
    key: 'event_routeDeletedFile',
    objectType: 'route',
    verb: 'remove',
  },

  {
    columnName: 'first ascensionist',
    field: FIELD.firstAscensionist,
    key: 'event_userUpdatedFirstAscensionist',
    objectType: 'user',
    tombstone: 'newValue',
    verb: 'add',
  },
  // Migrated history again, for the same reason as the parking pin above: a claim made before the
  // cutover arrives as an `update` carrying the name in a change row rather than as an `add`
  // carrying it in metadata.
  {
    columnName: 'first ascensionist',
    field: FIELD.firstAscensionist,
    key: 'event_userUpdatedFirstAscensionist',
    objectType: 'user',
    tombstone: 'newValue',
    verb: 'update',
  },
  // The three invitation rows name an address the invitee has no account for, and point
  // `entityId` at the inviter. `names: 'stored'` is what keeps hydration off that person.
  // No `field` either: the headline already is the address, so a change line would repeat it.
  {
    columnName: 'invitation',
    key: 'event_userCreatedInvitation',
    names: 'stored',
    objectType: 'user',
    verb: 'invite',
  },
  {
    columnName: 'invitation',
    key: 'event_userUpdatedInvitation',
    names: 'stored',
    objectType: 'user',
    verb: 'accept',
  },
  {
    columnName: 'invitation',
    key: 'event_userDeletedInvitation',
    names: 'stored',
    objectType: 'user',
    verb: 'remove',
  },
  {
    columnName: 'role',
    field: FIELD.role,
    key: 'event_userUpdatedRole',
    objectType: 'user',
    tombstone: 'newValue',
    verb: 'update',
  },
  // No `field`: a removal stores no old/new pair, and the shared-by-column registry used to
  // give it one anyway, rendering "Role: maintainer to Not set" under "removed from the region".
  {
    columnName: 'role',
    key: 'event_userDeletedRole',
    objectType: 'user',
    row: 'none',
    tombstone: 'newValue',
    verb: 'remove',
  },
  // Leaving is its own event. It shared `role` with being removed until migration 0094, which
  // is why the feed used to say "Mara removed Mara from the region". No `tombstone`: the
  // sentence names only the actor, who is also the subject.
  { columnName: 'membership', key: 'event_userDeletedMembership', objectType: 'user', row: 'none', verb: 'leave' },
  {
    columnName: 'username',
    field: FIELD.username,
    key: 'event_userUpdatedUsername',
    objectType: 'user',
    tombstone: 'newValue',
    verb: 'update',
  },
] as const satisfies readonly VerbEntry[]

/**
 * The triples above without their presentation, for the drift guards and the wording catalogue.
 *
 * Widened first: only some `as const` members declare the presentation fields, and a union
 * cannot be destructured on a key its every member does not have.
 */
export const WRITTEN_ROWS: Partial<VerbEntry>[] = (VERBS as readonly VerbEntry[]).map(
  ({ field: _field, key: _key, names: _names, status: _status, tombstone: _tombstone, ...written }) => written,
)

/** The columns declared for `<entityType> updated`, which is what a column diff may emit. */
export type DeclaredColumn<E extends EventObjectType> = Extract<
  (typeof VERBS)[number],
  { columnName: string; objectType: E; verb: 'update' }
>['columnName']

/** What a mutation may write: one member per catalogue entry, literals intact. */
export type DeclaredRow = Triple<(typeof VERBS)[number]>

/**
 * The half of an entry a mutation may spell. Everything else on the entry is presentation,
 * which a writer must not be able to set.
 *
 * `newValue` is excluded on purpose. Four entries pin it to a literal ascent type, and
 * `createAscent` passes the whole `AscentType` union, which is assignable to none of them
 * individually. The enum stays guarded by the round trip in `verbs.test.ts` instead.
 */
type Presentation = 'field' | 'key' | 'names' | 'newValue' | 'row' | 'status' | 'tombstone'

/**
 * Distributes over the union, and gives an entry that declares no column an explicit
 * `columnName?: undefined`.
 *
 * Both halves are load-bearing. A non-distributive `Omit<VerbEntry, Presentation>` would
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
const DEGRADED: Partial<Record<`${EventObjectType}:${EventVerb}`, MessageKey>> = {
  'area:update': 'event_areaUpdated',
  'ascent:create': 'event_ascentCreated',
  'ascent:update': 'event_ascentUpdated',
  'block:update': 'event_blockUpdated',
  'route:update': 'event_routeUpdated',
}

/** True of any row whatsoever, which is all that is left to say about one nothing above matches. */
const GENERIC: MessageKey = 'event_genericChange'

/**
 * Entities whose `newValue` scopes the verb rather than a column. Derived from the entries
 * that declare one, so a second value-scoped family needs no change here.
 *
 * Declared above {@link BY_ID}, which builds its keys through `verbId` at module load: as a
 * `const` this sits in the temporal dead zone until its own line runs.
 */
const VALUE_SCOPED = new Set<string>(
  VERBS.filter((entry) => 'value' in entry).map((entry) => `${entry.objectType}:${entry.verb}`),
)

/** The index holds the whole entry, so the sentence, the field, the name slot and the status
 *  glyph all come out of one lookup instead of four re-derivations. */
const BY_ID = new Map<string, VerbEntry>(VERBS.map((verb) => [verbId(verb), verb]))

/**
 * The fields that pick an entry. Both a stored row and a catalogue entry satisfy it, which is
 * how `verbs.test.ts` can feed the catalogue back in to prove every entry is reachable.
 */
export type VerbLookup = Partial<Pick<VerbEntry, 'columnName' | 'value'>> &
  Pick<VerbEntry, 'objectType' | 'verb'> & { cleared?: boolean }

/**
 * The catalogue entry a stored row matches, or `undefined` for a row no writer can emit.
 *
 * Deliberately takes the wide shape rather than {@link DeclaredRow}: it reads stored
 * lines, including ones from migrated history like `route:update:retired` that no current writer produces
 * and that DEGRADED and GENERIC exist for. Narrow seam for writing, wide seam for reading.
 */
export function verbEntry(line: VerbLookup): undefined | VerbEntry {
  // A cleared column first, then the plain entry: only one column has both, and every other
  // cleared value belongs to the same sentence as a set one ("edited the description" covers a
  // description that was emptied).
  // The plain key is the FALLBACK, so it has to be built without the flag: only one column has a
  // cleared entry, and every other emptied value belongs to the same sentence as a set one
  // ("edited the description" covers a description that was emptied).
  return (line.cleared === true ? BY_ID.get(verbId(line)) : undefined) ?? BY_ID.get(verbId({ ...line, cleared: false }))
}

/**
 * The sentence a row renders as: its catalogue entry, the vaguer verb for its entity, or the
 * generic one. Always a key paraglide has, so nothing can print itself onto a card.
 */
export function verbKey(line: VerbLookup): MessageKey {
  return (
    verbEntry(line)?.key ??
    // A deletion never degrades to the vaguer verb for its entity: "edited" for something that is
    // gone is worse than saying nothing specific at all.
    (line.verb === 'delete' || line.verb === 'remove' ? undefined : DEGRADED[`${line.objectType}:${line.verb}`]) ??
    GENERIC
  )
}

/** Built the same way for the catalogue and for a line, so the two can only match or both fail. */
function verbId(line: VerbLookup): string {
  const base = `${line.objectType}:${line.verb}`
  // A logged ascent is scoped by the type it recorded rather than by a column, which is how each
  // of the four gets its own sentence and status glyph.
  const scope = VALUE_SCOPED.has(base) ? line.value : line.columnName
  const key = scope == null ? base : `${base}:${scope}`
  return line.cleared === true ? `${key}:cleared` : key
}
