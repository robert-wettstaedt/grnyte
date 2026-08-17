/**
 * Who hears about a reaction or a comment, and what their inbox row points at.
 *
 * Split out of `reactions.remote.ts` for the usual reason (a `.remote.ts` pulls in SvelteKit's
 * client runtime and cannot be imported from a test), and because the subscriber rule is the one
 * thing here worth testing.
 */
import { db as baseDb } from '$lib/db/db.server'
import type * as schema from '$lib/db/schema'
import { files, notifications, reactions } from '$lib/db/schema'
import { objectOf } from '$lib/entities/event/dto'
import { fileParent } from '$lib/entities/file/mapper'
import type { NotificationEntityType } from '$lib/entities/notification/dto'
import { notify } from '$lib/entities/notification/notification.server'
import { and, eq, isNull } from 'drizzle-orm'

/** The event columns the fan-out reads. A row straight from the table satisfies it. */
type EventRow = Pick<
  schema.Event,
  'actorFk' | 'areaFk' | 'ascentFk' | 'blockFk' | 'fileFk' | 'id' | 'regionFk' | 'routeFk' | 'subjectFk'
>

/** The five kinds an inbox row can point at, as a set to test membership against. */
const NOTIFIABLE = new Set<string>(['area', 'ascent', 'block', 'route', 'user'])

/**
 * Take back, or re-point, the inbox row a comment wrote once that comment is gone.
 *
 * The same rule as {@link dropReactionNotification}, and for the same reason: "Bob commented on
 * your entry", tapped through to a thread with nothing in it, leaves the reader unable to tell
 * whether they misread it or Bob deleted it.
 *
 * Deleting outright is not enough, because one row covers a whole conversation: the inbox holds
 * one row per (reader, actor, event), pointed at the comment it was written about, and an unread
 * row keeps pointing at the FIRST one. Somebody who says two things and deletes the first would
 * otherwise erase the reader's only notice of the second. So the row survives with its pointer
 * moved to whatever that person still has standing on the card.
 */
export async function dropCommentNotification(input: {
  actorFk: number
  eventFk: number
  reactionFk: number
}): Promise<void> {
  const remaining = await baseDb.query.reactions.findFirst({
    columns: { id: true },
    orderBy: (table, { desc }) => desc(table.id),
    where: and(
      eq(reactions.eventFk, input.eventFk),
      eq(reactions.userFk, input.actorFk),
      eq(reactions.type, 'comment'),
      isNull(reactions.deletedAt),
    ),
  })

  const rows = and(eq(notifications.reactionFk, input.reactionFk), eq(notifications.sourceType, 'comment'))

  if (remaining == null) {
    await baseDb.delete(notifications).where(rows)
    return
  }

  await baseDb.update(notifications).set({ reactionFk: remaining.id }).where(rows)
}

/**
 * Take back the inbox row a reaction wrote, once the last reaction behind it is gone.
 *
 * An inbox row about a reaction that no longer exists is a sentence with nothing behind it: the
 * reader taps "Ada reacted to your entry", finds no chip, and has no way to tell whether they
 * misread it or Ada thought better of it. Scoped to this actor's rows on this event, so somebody
 * else's reaction keeps its own.
 */
export async function dropReactionNotification(input: { actorFk: number; eventFk: number }): Promise<void> {
  const remaining = await baseDb.query.reactions.findFirst({
    columns: { id: true },
    where: and(
      eq(reactions.eventFk, input.eventFk),
      eq(reactions.userFk, input.actorFk),
      eq(reactions.type, 'emoji'),
      isNull(reactions.deletedAt),
    ),
  })

  if (remaining != null) {
    return
  }

  await baseDb
    .delete(notifications)
    .where(
      and(
        eq(notifications.eventFk, input.eventFk),
        eq(notifications.actorFk, input.actorFk),
        eq(notifications.sourceType, 'reaction'),
      ),
    )
}

/**
 * What an inbox row about this event links to.
 *
 * The event's own object, except for an upload: a file has no page, so the row names what the
 * photos landed on, which is what the card names too. That parent costs the one query this
 * function makes, and only for uploads.
 */
export async function eventSubject(
  event: EventRow,
): Promise<undefined | { entityId: number | string; entityType: NotificationEntityType }> {
  const object = objectOf(event)

  if (object == null) {
    return undefined
  }

  if (object.type === 'file') {
    const file = await baseDb.query.files.findFirst({
      columns: { areaFk: true, ascentFk: true, blockFk: true, routeFk: true },
      where: eq(files.id, String(object.id)),
    })
    const parent = file == null ? undefined : fileParent(file)

    return parent == null ? undefined : { entityId: parent.id, entityType: parent.type as NotificationEntityType }
  }

  return NOTIFIABLE.has(object.type)
    ? { entityId: object.id, entityType: object.type as NotificationEntityType }
    : undefined
}

/**
 * Tell the people already in this conversation that somebody said something.
 *
 * Derived rather than stored (no subscription table): the event's actor, plus everybody who has
 * commented on it. A reply therefore reaches the whole thread, and joining the thread is what
 * subscribes you to it. `notify` drops the actor, so nobody is told about their own comment.
 */
export async function notifyComment(input: {
  actorFk: number
  event: EventRow
  /** The comment itself, so the inbox row can point at the line rather than at the card. */
  reactionFk: number
}): Promise<void> {
  const subject = await eventSubject(input.event)

  if (subject == null) {
    return
  }

  const authors = await baseDb
    .selectDistinct({ userFk: reactions.userFk })
    .from(reactions)
    .where(and(eq(reactions.eventFk, input.event.id), eq(reactions.type, 'comment'), isNull(reactions.deletedAt)))

  await notify({
    ...subject,
    actorFk: input.actorFk,
    eventFk: input.event.id,
    reactionFk: input.reactionFk,
    regionFk: input.event.regionFk,
    sourceType: 'comment',
    userFks: [input.event.actorFk, ...authors.map((row) => row.userFk)],
  })
}

/**
 * Tell whoever the card belongs to that somebody reacted to it.
 *
 * One recipient, because an event has one actor. `toggleReaction` has already refused a reaction
 * on your own event, so this never writes a row for the person who sent it.
 */
export async function notifyReaction(input: { actorFk: number; event: EventRow }): Promise<void> {
  const subject = await eventSubject(input.event)

  if (subject == null) {
    return
  }

  await notify({
    ...subject,
    actorFk: input.actorFk,
    eventFk: input.event.id,
    regionFk: input.event.regionFk,
    sourceType: 'reaction',
    userFks: [input.event.actorFk],
  })
}
