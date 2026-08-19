/**
 * Who hears about a reaction or a comment, and what their inbox row points at.
 *
 * Split out of `reactions.remote.ts` for the usual reason (a `.remote.ts` pulls in SvelteKit's
 * client runtime and cannot be imported from a test), and because the subscriber rule is the one
 * thing here worth testing.
 */
import { getReferences } from '$lib/components/Markdown/lib/remark-references'
import { db as baseDb } from '$lib/db/db.server'
import type * as schema from '$lib/db/schema'
import { files, reactions } from '$lib/db/schema'
import { objectOf } from '$lib/entities/event/dto'
import type { EventObject } from '$lib/entities/event/event.server'
import { fileParent } from '$lib/entities/file/mapper'
import {
  notify,
  notifyMentions,
  repointNotifications,
  retractNotifications,
} from '$lib/entities/notification/notification.server'
import { and, eq, gte, isNull } from 'drizzle-orm'

/** The event columns the fan-out reads. A row straight from the table satisfies it. */
type EventRow = Pick<
  schema.Event,
  'actorFk' | 'areaFk' | 'ascentFk' | 'blockFk' | 'fileFk' | 'id' | 'regionFk' | 'routeFk' | 'subjectFk'
>

/** The five kinds an inbox row can point at, as a set to test membership against. */
const NOTIFIABLE = new Set<string>(['area', 'ascent', 'block', 'route', 'user'])

/**
 * Take a comment out of the thread, and the answers under it with it.
 *
 * A reply is only reachable through the comment it answers: `listComments` selects live top-level
 * rows and hands each its live children, so a reply whose parent is gone renders nowhere while
 * still counting towards `events.comment_count`. The button would read two over a thread that
 * shows nothing, and the words in it would be unrecoverable through the UI.
 *
 * So deleting the head of a thread deletes the answers under it, which is also what it means: the
 * sentence they were written about is gone. Soft, like the parent, so the rows are still there for
 * a moderator to look at.
 *
 * On the privileged handle, because that is the only one that can: `deleteComment` runs under RLS
 * on the caller's connection, whose UPDATE policy is their own rows, and the answers belong to
 * other people. That is the same reason the notification cleanup lives here.
 *
 * Emoji hanging off the comment are left alone deliberately: `parent_fk` carries those too, but a
 * chip on a comment is only ever drawn beside that comment, so a cleared comment takes its chips
 * off the screen already. They stay as the record of who once agreed with what.
 */
export async function dropComment(input: { actorFk: number; eventFk: number; reactionFk: number }): Promise<void> {
  const replies = await baseDb
    .update(reactions)
    .set({ deletedAt: new Date() })
    .where(and(eq(reactions.parentFk, input.reactionFk), eq(reactions.type, 'comment'), isNull(reactions.deletedAt)))
    .returning({ id: reactions.id, userFk: reactions.userFk })

  // The comment itself first, then each answer, each cleaned up against ITS OWN author: an inbox
  // row is keyed on who wrote the line, so a reply by somebody else re-points against what that
  // person still has standing, not against the person who deleted the thread.
  for (const gone of [{ id: input.reactionFk, userFk: input.actorFk }, ...replies]) {
    await dropCommentNotification({ actorFk: gone.userFk, eventFk: input.eventFk, reactionFk: gone.id })
  }
}

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
  // Everything this person still has standing on the card, newest first, with what each line
  // answers and who it names. One read for all three sentences: the thread row needs only the
  // newest, and a directed row needs the newest that would have written the SAME sentence.
  const live = await baseDb.query.reactions.findMany({
    columns: { body: true, id: true },
    orderBy: (table, { desc }) => desc(table.id),
    where: and(
      eq(reactions.eventFk, input.eventFk),
      eq(reactions.userFk, input.actorFk),
      eq(reactions.type, 'comment'),
      isNull(reactions.deletedAt),
    ),
    with: { parent: { columns: { userFk: true } } },
  })

  // Which line may stand in for the one that is gone, which is the only half of this the inbox
  // cannot answer for itself. The thread row is about the conversation, so any live line of this
  // person's carries it; a reply and a mention are about ONE line each, so they can only move to a
  // line that would have written the same sentence to the same reader, and go when there is none.
  await repointNotifications({
    reactionFk: input.reactionFk,
    replacement: (row) =>
      row.sourceType === 'comment'
        ? live[0]?.id
        : live.find((candidate) =>
            row.sourceType === 'comment_reply'
              ? candidate.parent?.userFk === row.userFk
              : getReferences(candidate.body).users.includes(row.userFk),
          )?.id,

    sourceTypes: ['comment', 'comment_reply', 'mention'],
  })
}

/**
 * Take back the inbox row a reaction wrote, once the last reaction behind it is gone.
 *
 * An inbox row about a reaction that no longer exists is a sentence with nothing behind it: the
 * reader taps "Ada reacted to your entry", finds no chip, and has no way to tell whether they
 * misread it or Ada thought better of it. Scoped to this actor's rows on this event, so somebody
 * else's reaction keeps its own.
 */
export async function dropReactionNotification(input: {
  actorFk: number
  /** The comment the reaction was on, when it was on a comment rather than the card. */
  commentFk?: number
  eventFk: number
}): Promise<void> {
  // Scoped to the same TARGET the reaction was on: clearing a 👍 from a comment must not take
  // back the inbox row about the 🔥 the same person still holds on the card.
  const target = input.commentFk == null ? isNull(reactions.parentFk) : eq(reactions.parentFk, input.commentFk)

  const remaining = await baseDb.query.reactions.findFirst({
    columns: { id: true },
    where: and(
      eq(reactions.eventFk, input.eventFk),
      eq(reactions.userFk, input.actorFk),
      eq(reactions.type, 'emoji'),
      target,
      isNull(reactions.deletedAt),
    ),
  })

  if (remaining != null) {
    return
  }

  // Its own sentence, and for a comment its own line: clearing a 👍 from a comment must not take
  // back the inbox row about the 🔥 the same person still holds on the card.
  await retractNotifications(
    input.commentFk == null
      ? { actorFk: input.actorFk, eventFk: input.eventFk, sourceType: 'reaction' }
      : {
          actorFk: input.actorFk,
          eventFk: input.eventFk,
          reactionFk: input.commentFk,
          sourceType: 'comment_reaction',
        },
  )
}

/**
 * What an inbox row about this event links to.
 *
 * The event's own object, except for an upload: a file has no page, so the row names what the
 * photos landed on, which is what the card names too. That parent costs the one query this
 * function makes, and only for uploads.
 */
export async function eventSubject(event: EventRow): Promise<EventObject | undefined> {
  const object = objectOf(event)

  if (object == null) {
    return undefined
  }

  if (object.type === 'file') {
    const file = await baseDb.query.files.findFirst({
      columns: { areaFk: true, ascentFk: true, blockFk: true, routeFk: true },
      where: eq(files.id, String(object.id)),
    })

    return file == null ? undefined : fileParent(file)
  }

  return NOTIFIABLE.has(object.type) ? { id: object.id, type: object.type } : undefined
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
  /** The markdown that was posted, which is where the mentions are read from. */
  body: string
  event: EventRow
  /** Whose comment this answers, when it is a reply. They hear that, and not the thread sentence. */
  parentAuthorFk?: number
  /** The comment itself, so the inbox row can point at the line rather than at the card. */
  reactionFk: number
}): Promise<void> {
  const subject = await eventSubject(input.event)

  if (subject == null) {
    return
  }

  /** Everything an inbox row about this comment points at, whichever sentence it ends up saying. */
  const shared = {
    actorFk: input.actorFk,
    eventFk: input.event.id,
    object: subject,
    reactionFk: input.reactionFk,
    regionFk: input.event.regionFk,
  }

  // One row per person, and the most specific sentence wins: answered, then named, then "somebody
  // said something under this". The unique key includes `source_type`, so two kinds about one
  // comment would be two rows in one inbox saying the same thing at different volumes, and the
  // reader would have to open both to find out they are the same comment.
  if (input.parentAuthorFk != null) {
    await notify({ ...shared, sourceType: 'comment_reply', userFks: [input.parentAuthorFk] })
  }

  const answered = input.parentAuthorFk == null ? [] : [input.parentAuthorFk]

  await notifyMentions({ ...shared, body: input.body, exclude: answered })

  const authors = await baseDb
    .selectDistinct({ userFk: reactions.userFk })
    .from(reactions)
    .where(and(eq(reactions.eventFk, input.event.id), eq(reactions.type, 'comment'), isNull(reactions.deletedAt)))

  const spoken = new Set([...answered, ...getReferences(input.body).users])
  const userFks = [input.event.actorFk, ...authors.map((row) => row.userFk)].filter((userFk) => !spoken.has(userFk))

  if (userFks.length === 0) {
    return
  }

  await notify({ ...shared, sourceType: 'comment', userFks })
}

/**
 * Tell whoever the card belongs to that somebody reacted to it.
 *
 * One recipient, because an event has one actor. `toggleReaction` has already refused a reaction
 * on your own event, so this never writes a row for the person who sent it.
 */
export async function notifyReaction(input: {
  actorFk: number
  /** The comment reacted to, when it was a comment rather than the card. */
  comment?: { id: number; userFk: number }
  event: EventRow
}): Promise<void> {
  const subject = await eventSubject(input.event)

  if (subject == null) {
    return
  }

  await notify({
    actorFk: input.actorFk,
    eventFk: input.event.id,
    object: subject,
    // Which line, so the permalink scrolls to the comment that was reacted to rather than to the
    // card it hangs under.
    reactionFk: input.comment?.id,
    regionFk: input.event.regionFk,
    // Its own sentence: "reacted to your entry" is wrong about a comment, and the reader who gets
    // it has no way to tell which of the two happened.
    sourceType: input.comment == null ? 'reaction' : 'comment_reaction',
    userFks: [input.comment?.userFk ?? input.event.actorFk],
  })
}

/**
 * Put back the answers a delete took with it, for the Undo the delete offers.
 *
 * The mirror of {@link dropComment}, and privileged for the same reason: the replies belong to
 * other people, so the caller's own-rows UPDATE policy cannot reach them.
 *
 * Scoped by WHEN rather than by "every deleted reply". A reply its own author had already deleted
 * carries an earlier `deleted_at` than the head did, and undoing somebody else's delete must not
 * resurrect it; the cascade stamps its rows at or after the head's, so "cleared no earlier than
 * the head was" is exactly the set this took down. That is also why the head's `deleted_at` has to
 * be read before it is cleared.
 *
 * The inbox rows the cascade cleaned up are NOT rebuilt, for the same reason `restoreComment` does
 * not re-notify: undo happens seconds later, and telling a thread twice about sentences it was
 * already told about is worse than the lost notice of one mis-tap.
 */
export async function restoreReplies(input: { deletedAt: Date; reactionFk: number }): Promise<void> {
  await baseDb
    .update(reactions)
    .set({ deletedAt: null })
    .where(
      and(
        eq(reactions.parentFk, input.reactionFk),
        eq(reactions.type, 'comment'),
        gte(reactions.deletedAt, input.deletedAt),
      ),
    )
}
