import type { NotificationSourceType } from './dto'

interface Traits {
  /** Stored without its actor, down to the row the reader's device syncs: a removal never names the
   *  admin, and a report notice neither the reporter nor whoever closed it. */
  anonymous: boolean
  /** Still reaches a recipient who left the region: a removal's statement is owed to whoever posted it,
   *  and its row opens that statement, never the region. */
  outlivesMembership: boolean
  /** Which push switch gates it. Only push: every row is in the inbox whatever the switches say. */
  push: 'comments' | 'directed' | 'reactions'
  /** Send-queue only: nothing renders it, its recipient cannot read the region it names, so it skips
   *  the `region.read` re-check, is stamped read once sent and never counts toward the badge. */
  queueOnly: boolean
  /** Draws its entity row; false where the caption (and the actor's avatar) already said the subject. */
  row: boolean
  /** Keeps its actor when the actor is the recipient (their own video finished processing). */
  selfAddressed: boolean
}

/** The per-type traits the inbox, push and recipient filter read. A type added to the DB enum does
 *  not compile until it declares each one. */
const TRAITS = {
  ascent_deleted: {
    anonymous: false,
    outlivesMembership: false,
    push: 'directed',
    queueOnly: false,
    row: false,
    selfAddressed: false,
  },
  ascent_edited: {
    anonymous: false,
    outlivesMembership: false,
    push: 'directed',
    queueOnly: false,
    row: true,
    selfAddressed: false,
  },
  comment: {
    anonymous: false,
    outlivesMembership: false,
    push: 'comments',
    queueOnly: false,
    row: true,
    selfAddressed: false,
  },
  comment_reaction: {
    anonymous: false,
    outlivesMembership: false,
    push: 'directed',
    queueOnly: false,
    row: true,
    selfAddressed: false,
  },
  // A reply is a comment aimed at you, so it answers to the comment switch.
  comment_reply: {
    anonymous: false,
    outlivesMembership: false,
    push: 'comments',
    queueOnly: false,
    row: true,
    selfAddressed: false,
  },
  // The item is gone (or back), so there is no row to draw; the row opens the statement instead.
  content_removed: {
    anonymous: true,
    outlivesMembership: true,
    push: 'directed',
    queueOnly: false,
    row: false,
    selfAddressed: false,
  },
  // To the region's admins, once per reported object; the row opens the queue.
  content_reported: {
    anonymous: true,
    outlivesMembership: false,
    push: 'directed',
    queueOnly: false,
    row: false,
    selfAddressed: false,
  },
  content_restored: {
    anonymous: true,
    outlivesMembership: true,
    push: 'directed',
    queueOnly: false,
    row: false,
    selfAddressed: false,
  },
  invitation_received: {
    anonymous: false,
    outlivesMembership: false,
    push: 'directed',
    queueOnly: true,
    row: false,
    selfAddressed: false,
  },
  invite_accepted: {
    anonymous: false,
    outlivesMembership: false,
    push: 'directed',
    queueOnly: false,
    row: false,
    selfAddressed: false,
  },
  membership_removed: {
    anonymous: false,
    outlivesMembership: false,
    push: 'directed',
    queueOnly: true,
    row: false,
    selfAddressed: false,
  },
  mention: {
    anonymous: false,
    outlivesMembership: false,
    push: 'directed',
    queueOnly: false,
    row: true,
    selfAddressed: false,
  },
  reaction: {
    anonymous: false,
    outlivesMembership: false,
    push: 'reactions',
    queueOnly: false,
    row: true,
    selfAddressed: false,
  },
  // To each reporter, with the outcome; the report itself is gone.
  report_closed: {
    anonymous: true,
    outlivesMembership: false,
    push: 'directed',
    queueOnly: false,
    row: false,
    selfAddressed: false,
  },
  role_changed: {
    anonymous: false,
    outlivesMembership: false,
    push: 'directed',
    queueOnly: false,
    row: false,
    selfAddressed: false,
  },
  video_ready: {
    anonymous: false,
    outlivesMembership: false,
    push: 'directed',
    queueOnly: false,
    row: true,
    selfAddressed: true,
  },
} as const satisfies Record<NotificationSourceType, Traits>

/** A type this build does not know yet (a tab older than the enum) behaves as an ordinary row. */
const UNKNOWN: Readonly<Traits> = {
  anonymous: false,
  outlivesMembership: false,
  push: 'directed',
  queueOnly: false,
  row: true,
  selfAddressed: false,
}

export const sourceTraits = (sourceType: NotificationSourceType): Readonly<Traits> =>
  Object.hasOwn(TRAITS, sourceType) ? TRAITS[sourceType] : UNKNOWN

// Sorted, so a Zero query naming the list keeps one stable hash.
const typesWith = (trait: 'outlivesMembership' | 'queueOnly'): readonly NotificationSourceType[] =>
  (Object.keys(TRAITS) as NotificationSourceType[]).filter((type) => TRAITS[type][trait]).sort()

/** Excluded from the inbox queries. */
export const QUEUE_ONLY = typesWith('queueOnly')

/** Let past the inbox queries' region gate. */
export const OUTLIVES_MEMBERSHIP = typesWith('outlivesMembership')
