import type { MessageKey } from '$lib/i18n/message'
import { isDatedMoment } from '$lib/i18n/relativeTime'
import type { ActivityListItem } from './dto'

/**
 * The one line a detail page shows above its log: who last touched this record, and when.
 *
 * Pure, and separate from the component, because it is three-way and every branch is a claim
 * that has to be true. Saying "updated" about a record nobody has edited, or naming an actor
 * whose row has not synced yet, are both worse than saying less.
 */

export interface ActivityMetaLine {
  /** Empty when the actor is not known, which is what picks a key that does not name one. */
  actor: string
  key: MessageKey
  /** Epoch millis. The caller formats it against its own clock and locale. */
  timestamp: number
}

/** What a detail page knows about its entity, apart from its log. */
export interface ActivityMetaSource {
  /** The entity's own creation stamp. Absent on rows written before the column existed. */
  createdAt: Date | undefined
  /**
   * Username behind the entity's `createdBy`. Only ever read when the log is empty, and absent
   * until `usersByIds` answers.
   */
  creatorName: string | undefined
  /** The newest row in scope, or `undefined` when nothing has been logged about this entity. */
  latest: ActivityListItem | undefined
  /**
   * The clock. Injected rather than read here so this stays pure, and because the sentence has
   * to know which form the time will take: `formatUploadedAt` switches to a date after a week,
   * and a date needs the preposition a relative phrase does not.
   */
  now: number
}

/**
 * Split out rather than eight literals inline, so the three axes (what happened, is the actor
 * known, does the time read as a date) cannot pair up wrongly and a missing key is a compile
 * error rather than a sentence with the wrong preposition in it.
 */
const KEYS = {
  created: {
    dated: { known: 'activity_metaCreatedOn', unknown: 'activity_metaCreatedOnUnknown' },
    relative: { known: 'activity_metaCreated', unknown: 'activity_metaCreatedUnknown' },
  },
  updated: {
    dated: { known: 'activity_metaUpdatedOn', unknown: 'activity_metaUpdatedOnUnknown' },
    relative: { known: 'activity_metaUpdated', unknown: 'activity_metaUpdatedUnknown' },
  },
} as const satisfies Record<string, Record<string, Record<string, MessageKey>>>

export function activityMeta({
  createdAt,
  creatorName,
  latest,
  now,
}: ActivityMetaSource): ActivityMetaLine | undefined {
  if (latest != null) {
    // A `created` row is the record appearing, not a change to it; everything else in scope is a
    // change. `columnName` tells them apart without a second lookup: only column-level rows carry
    // one, and an upload is `type: 'uploaded'`, so it can never be mistaken for the creation.
    const created = latest.type === 'created' && latest.columnName == null
    return line(created, latest.userName, latest.createdAt, now)
  }

  // Nothing logged at all: an entity imported before the log existed, so its own columns are all
  // there is to read. Without a stamp there is no true line to write, so there is no line.
  if (createdAt == null) {
    return undefined
  }

  return line(true, creatorName, createdAt.getTime(), now)
}

const line = (created: boolean, actor: string | undefined, timestamp: number, now: number): ActivityMetaLine => ({
  actor: actor ?? '',
  key: KEYS[created ? 'created' : 'updated'][isDatedMoment(timestamp, now) ? 'dated' : 'relative'][
    actor == null || actor === '' ? 'unknown' : 'known'
  ],
  timestamp,
})
