import type { NotificationSourceType } from './dto'

interface Traits {
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
  ascent_deleted: { push: 'directed', queueOnly: false, row: false, selfAddressed: false },
  ascent_edited: { push: 'directed', queueOnly: false, row: true, selfAddressed: false },
  comment: { push: 'comments', queueOnly: false, row: true, selfAddressed: false },
  comment_reaction: { push: 'directed', queueOnly: false, row: true, selfAddressed: false },
  // A reply is a comment aimed at you, so it answers to the comment switch.
  comment_reply: { push: 'comments', queueOnly: false, row: true, selfAddressed: false },
  invitation_received: { push: 'directed', queueOnly: true, row: false, selfAddressed: false },
  invite_accepted: { push: 'directed', queueOnly: false, row: false, selfAddressed: false },
  membership_removed: { push: 'directed', queueOnly: true, row: false, selfAddressed: false },
  mention: { push: 'directed', queueOnly: false, row: true, selfAddressed: false },
  reaction: { push: 'reactions', queueOnly: false, row: true, selfAddressed: false },
  role_changed: { push: 'directed', queueOnly: false, row: false, selfAddressed: false },
  video_ready: { push: 'directed', queueOnly: false, row: true, selfAddressed: true },
} as const satisfies Record<NotificationSourceType, Traits>

/** A type this build does not know yet (a tab older than the enum) behaves as an ordinary row. */
const UNKNOWN: Readonly<Traits> = { push: 'directed', queueOnly: false, row: true, selfAddressed: false }

export const sourceTraits = (sourceType: NotificationSourceType): Readonly<Traits> =>
  Object.hasOwn(TRAITS, sourceType) ? TRAITS[sourceType] : UNKNOWN

/** Sorted, so the Zero query that excludes them keeps one stable hash. */
export const QUEUE_ONLY: readonly NotificationSourceType[] = (Object.keys(TRAITS) as NotificationSourceType[])
  .filter((type) => TRAITS[type].queueOnly)
  .sort()
