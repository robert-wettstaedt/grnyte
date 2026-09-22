/**
 * The decisions the notifications cron makes, without the database it makes them against.
 *
 * Extracted from `routes/api/tasks/notifications/+server.ts` so they can be tested and mutated:
 * every one of them fails silently, deciding who hears about what, where a push lands, and how far
 * a scan may mark. None of it is visible from a run that reports success.
 */
import { blockName } from '$lib/entities/block/mapper'
import { toDisplayName } from '$lib/entities/displayName'
import { isAscentEvent } from '$lib/entities/event/dto'
import type { DigestEvent } from '$lib/entities/notification/digest.server'
import type { NotificationSourceType } from '$lib/entities/notification/dto'
import type { Locale } from '$lib/paraglide/runtime'

export type ParentName = ({ kind: 'block'; name: string; order: number } | { kind: 'plain'; name: string }) & {
  path: string
}

const BATCH_SIZE = 4

/** Which switch governs an event: everything that is not an ascent or a person is a guidebook edit. */
export function categoryEnabled(
  event: Pick<DigestEvent, 'ascentFk' | 'subjectFk' | 'verb'>,
  settings: { notifyAscents: boolean | null; notifyCommunity: boolean | null; notifyGuidebookEdits: boolean | null },
): boolean {
  if (isAscentEvent({ ascent: event.ascentFk != null, verb: event.verb })) {
    return settings.notifyAscents !== false
  }

  if (event.subjectFk != null) {
    return settings.notifyCommunity !== false
  }

  return settings.notifyGuidebookEdits !== false
}

/**
 * Whether this person wants a push for this row.
 *
 * A reaction and a comment have switches of their own, because they arrive at a different rhythm
 * than the rest of the directed half: a busy card can produce several in an evening, and somebody
 * who wants to hear about a mention on their ascent may not want to hear about every 👍. Anything
 * else is `notifyDirected`, which is the switch it always was.
 *
 * Only PUSH. Every one of these rows is in the inbox whatever the switches say.
 */
export function directedWanted(row: {
  notifyComments: boolean | null
  notifyDirected: boolean | null
  notifyReactions: boolean | null
  sourceType: string
}): boolean {
  if (row.sourceType === 'reaction') {
    return row.notifyReactions !== false
  }

  // A reply is a comment somebody aimed at you, so it answers to the comment switch rather than
  // to a third one nobody would think to look for.
  if (row.sourceType === 'comment' || row.sourceType === 'comment_reply') {
    return row.notifyComments !== false
  }

  return row.notifyDirected !== false
}

/**
 * Run `task` over `items` a few at a time, and collect the results.
 *
 * One at a time was the shape both halves had: a subscriber's queries and its HTTPS send waiting
 * on the previous subscriber's, inside a job that has five minutes.
 *
 * A fixed width rather than a queue, and no longer below the database pool. Every query here is
 * its own short pinned transaction, so the four items queue on the pool for a moment each instead
 * of holding a connection across an HTTPS send. Upgrade = one ranked query over all subscribers,
 * if the subscriber list ever outgrows the window.
 */
export async function inBatches<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []

  for (let index = 0; index < items.length; index += BATCH_SIZE) {
    results.push(...(await Promise.all(items.slice(index, index + BATCH_SIZE).map(task))))
  }

  return results
}

/** That name in one recipient's language. */
export function parentNameIn(parent: ParentName | undefined, locale: Locale): string | undefined {
  if (parent == null) {
    return undefined
  }

  return parent.kind === 'block' ? blockName(parent.name, parent.order, locale) : toDisplayName(parent.name, locale)
}

/**
 * Where a push opens. The service worker hands whatever is here to `clients.openWindow`, so it
 * must stay in step with `/(app)/(shell)/events/[id]`.
 *
 * The inbox is the fallback for a row that names no card, but never for the queue-only pair, whose
 * row it cannot show. An invitee goes to settings, where `listMyInvitations` renders the accept;
 * a removed member has no destination inside the region at all, so they get the app.
 */
export function pathnameFor(row: {
  eventFk: null | number
  fileFk: null | string
  reactionFk: null | number
  sourceType: NotificationSourceType
}): string {
  if (row.sourceType === 'invitation_received') {
    return '/settings'
  }

  if (row.sourceType === 'membership_removed') {
    return '/'
  }

  // Only when the parent could not be resolved. `/f/<id>` renders any file, but it is a share
  // surface with no nav, so a reader who lands there from a push cannot get back into the app.
  if (row.fileFk != null) {
    return `/f/${row.fileFk}`
  }

  if (row.eventFk == null) {
    return '/notifications'
  }

  return `/events/${row.eventFk}${row.reactionFk == null ? '' : `?comment=${row.reactionFk}`}`
}

/**
 * How far a scan may safely mark, given `created_at` is not unique.
 *
 * A full scan can cut inside a group of events sharing one millisecond, and the mark is a
 * timestamp: advancing to the last row's would put the tied siblings below it forever. So a
 * truncated scan stops at the last row BEFORE the trailing tie group, which is then re-read next
 * run. The one case that cannot be handled that way is a whole window of one millisecond, where
 * stopping short would never advance at all; there the tie is taken whole, which is the lesser
 * failure (a repeat, not a silence) and needs 500 events inside one millisecond to reach.
 */
export function safeMark(scanned: readonly { createdAt: Date }[], truncated: boolean): Date {
  const last = scanned[scanned.length - 1].createdAt

  if (!truncated) {
    return last
  }

  const kept = scanned.filter((row) => row.createdAt.getTime() !== last.getTime())
  return kept.length === 0 ? last : kept[kept.length - 1].createdAt
}
