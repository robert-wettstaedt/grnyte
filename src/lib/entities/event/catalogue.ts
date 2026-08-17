/**
 * The shape the sentence catalogue reads.
 *
 * One row per thing a card can say about one entity, which is what `activities` stored and what
 * `legacy.ts` now builds from an event. Spelled out here rather than derived from the `activities`
 * Zero row, which is the table this whole migration is leaving: the catalogue outlives it, and a
 * type pointing at a table that is about to be dropped would take the catalogue down with it.
 */

/**
 * The entity kinds a catalogue row can be about.
 *
 * The six event object types, minus `subject` (which reads as `user` here) and plus nothing: the
 * catalogue and the object columns cover the same ground, and `legacy.ts` maps one onto the other.
 */
export type CatalogueEntityType = 'area' | 'ascent' | 'block' | 'file' | 'route' | 'user'

/** The entity kinds a row can name as its parent, which is the narrower set: neither a file nor a
 *  user is ever a place something sits under. An ascent is, for the media hung off one. */
export type CatalogueParentType = 'area' | 'ascent' | 'block' | 'route'

/**
 * One row of the log as the catalogue reads it.
 *
 * The old table's shape, verbatim, because the catalogue is still keyed on its triple
 * (`entityType`, `type`, `columnName`). What produces it is `legacy.ts`, from an event.
 */
export interface CatalogueRow {
  /** Only set on rows that name a column: the column that changed. */
  columnName: string | undefined
  /** Epoch millis of when the event was logged. */
  createdAt: number
  /** The entity's id as text, even when the entity keys on a number. */
  entityId: string
  entityType: CatalogueEntityType
  id: number
  /** Free-form string the writer attached, e.g. coordinates or a topo line count. */
  metadata: string | undefined
  newValue: string | undefined
  oldValue: string | undefined
  parentEntityId: string | undefined
  parentEntityType: CatalogueParentType | undefined
  regionFk: number
  type: CatalogueType
  userFk: number
  /** The actor's username; empty while the user row hasn't synced. */
  userName: string
}

/** The four things the old shape could say happened. `legacy.ts` maps the nine verbs onto them. */
export type CatalogueType = 'created' | 'deleted' | 'updated' | 'uploaded'

/** What the feed's segmented control filters on: ascents versus every other kind of edit. */
export type EventCategory = 'ascent' | 'update'
