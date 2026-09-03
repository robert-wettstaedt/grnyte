/**
 * Fan-out for the directed half of notifications: the events aimed at exactly one person.
 *
 * Region activity is deliberately NOT here. It is already on screen in the feed, already grouped
 * and already hydrated, so a row per recipient would store what the feed holds N times over only
 * to render it a second time somewhere else.
 *
 * Split out of the `.remote.ts` modules that call it for the usual reason (a `.remote.ts` pulls in
 * SvelteKit's client runtime and cannot be imported from a test), and because the recipient rule
 * is the one thing here worth testing against a real database.
 */
import { REGION_PERMISSION_READ } from '$lib/auth'
import { getReferences } from '$lib/components/Markdown/lib/remark-references'
import { db as baseDb } from '$lib/db/db.server'
import { notifications, regionMembers, rolePermissions, users } from '$lib/db/schema'
import { objectColumns, type EventObject } from '$lib/entities/event/event.server'
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { NotificationSourceType } from './dto'

/** One recipient, in both the shapes a row needs: the app's id and the one RLS compares. */
export interface NotificationRecipient {
  authUserFk: string
  userFk: number
}

/** What a mutation hands over: who did what to which entity, and who might want to know. */
export interface NotifyInput {
  /** Who caused it. Dropped from the recipients, so nobody is told about their own edit. */
  actorFk: number
  /**
   * Which card, for the source types that are about one. Part of the idempotency key, so two
   * reactions on two events about the same route stay two rows.
   */
  eventFk?: number
  /** Whatever the sentence needs that the entity cannot answer, e.g. the granted role. */
  metadata?: string
  /** What the row is about. Written into whichever of the six typed columns matches its type. */
  object: EventObject
  /** Which comment, so the inbox can point at the row rather than at the card. */
  reactionFk?: number
  regionFk: number
  sourceType: NotificationSourceType
  /** Candidate recipients, filtered down to the ones who can actually read the region. */
  userFks: readonly number[]
}

/**
 * Which of `userFks` may be told about something in `regionFk`, minus the actor.
 *
 * Mirrors the `events` SELECT policy exactly (`authorize_in_region('region.read', region_fk)`,
 * which resolves to an active `region_members` row whose role holds that permission), because
 * anything looser notifies somebody about a region they cannot open. Exported so the test can
 * hold it against who can `SELECT` the row rather than trusting this to have got it right.
 */
export async function notificationRecipients(
  regionFk: number,
  userFks: readonly number[],
  actorFk: number,
): Promise<NotificationRecipient[]> {
  const candidates = [...new Set(userFks)].filter((userFk) => userFk !== actorFk)

  if (candidates.length === 0) {
    return []
  }

  return baseDb
    .selectDistinct({ authUserFk: regionMembers.authUserFk, userFk: regionMembers.userFk })
    .from(regionMembers)
    .innerJoin(rolePermissions, eq(rolePermissions.role, regionMembers.role))
    .where(
      and(
        eq(regionMembers.regionFk, regionFk),
        eq(regionMembers.isActive, true),
        eq(rolePermissions.permission, REGION_PERMISSION_READ),
        inArray(regionMembers.userFk, candidates),
      ),
    )
}

/**
 * Write one notification per recipient who can see the thing it is about.
 *
 * Runs on the privileged handle rather than the caller's RLS transaction, which is forced: there
 * is no INSERT policy on `notifications` and there deliberately cannot be one. An own-rows policy
 * would reject a row the actor is writing for somebody else, and anything wider would let anyone
 * holding a JWT post into a stranger's inbox.
 *
 * ponytail: that also puts the write outside the mutation's transaction, so a handler that fails
 * AFTER calling this leaves a notification for a change that rolled back. Call it last, which
 * every call site does. Upgrade = a queue the mutation enrolls in, if that ever bites.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const recipients = await notificationRecipients(input.regionFk, input.userFks, input.actorFk)

  if (recipients.length === 0) {
    return
  }

  await baseDb
    .insert(notifications)
    .values(
      recipients.map((recipient) => ({
        actorFk: input.actorFk,
        authUserFk: recipient.authUserFk,
        eventFk: input.eventFk,
        metadata: input.metadata,
        reactionFk: input.reactionFk,
        regionFk: input.regionFk,
        sourceType: input.sourceType,
        userFk: recipient.userFk,
        ...objectColumns(input.object),
      })),
    )
    // The unique index collapses the same event fired twice in a row, e.g. a double submit, or a
    // maintainer who saves the same edit again a minute later. It is a backstop, not the thing that
    // decides what is news: see {@link notifyMentions} for why a source type whose "again" is not a
    // new event has to work that out for itself before it gets here.
    //
    // Collapsed only while the row is still UNREAD, which is the case that idempotency is about.
    // The index carries no time, and a plain `do nothing` would therefore mute a genuinely new
    // event for as long as the old row survives: up to 30 days after a read, 90 unread. Once it
    // has been read the reader is done with it, so the same thing happening again is news: the row
    // goes back to unread and undelivered, with a fresh timestamp for the push debounce to count.
    .onConflictDoUpdate({
      set: {
        createdAt: new Date(),
        metadata: sql`excluded.metadata`,
        pushedAt: null,
        // Pointed at the newer line, for the case this SET runs at all: `setWhere` below means a
        // row the reader has NOT opened yet keeps pointing at the first comment, which is the one
        // the notification was written about.
        reactionFk: sql`excluded.reaction_fk`,
        readAt: null,
      },
      setWhere: isNotNull(notifications.readAt),
      // The whole key, in one target rather than the two partial ones this replaced: the card and
      // the object are both in it, and the nulls compare equal (see `notifications_source_idx`),
      // so a row that is about a card is separated by the card and a row that is not is separated
      // by the object.
      target: [
        notifications.userFk,
        notifications.sourceType,
        notifications.actorFk,
        notifications.regionFk,
        notifications.eventFk,
        notifications.areaFk,
        notifications.ascentFk,
        notifications.blockFk,
        notifications.fileFk,
        notifications.routeFk,
        notifications.subjectFk,
      ],
    })
}

/**
 * Tell everybody newly named in a markdown body that they were named in it.
 *
 * Newly is the whole point, so this is a diff and not a plain read of the saved body. A mention is
 * not an event that recurs; it happens once, when somebody writes the name. Every later save of
 * that text is the same mention again, and the {@link notify} unique index cannot be what tells
 * them apart, because the row it needs is not guaranteed to be there: cleanup drops read rows after
 * 30 days and unread ones after 90, and a row that has been read is deliberately re-armed on
 * conflict. Leaning on it re-pushed a months-old mention every time anyone touched the entity for
 * any other reason. Comparing the two bodies needs no row at all.
 */
export async function notifyMentions({
  exclude,
  ...input
}: {
  actorFk: number
  /** The markdown as stored. `null`/`undefined` (a cleared description) mentions nobody. */
  body: null | string | undefined
  /** The card this body hangs under, when it is a comment rather than a description. */
  eventFk?: number
  /**
   * People this body names who are being told something more specific about it elsewhere, so the
   * mention is not a second row saying less. A comment that answers Ada and names her tells her
   * she was answered; see `notifyComment`.
   */
  exclude?: readonly number[]
  object: EventObject
  /**
   * The body this save replaced. Anybody named in it has already been told, so they are dropped.
   * Omitted when creating, where there is nothing to have been told about yet. A name that is
   * removed and later written again is a fresh mention, and notifies again.
   */
  previousBody?: null | string
  /** The comment this body IS, so the inbox row can point at the line rather than the card. */
  reactionFk?: number
  regionFk: number
}): Promise<void> {
  const skip = new Set(exclude ?? [])
  const before = new Set(input.previousBody == null ? [] : getReferences(input.previousBody).users)
  const userFks = (input.body == null ? [] : getReferences(input.body).users).filter(
    (userFk) => !before.has(userFk) && !skip.has(userFk),
  )

  if (userFks.length === 0) {
    return
  }

  await notify({ ...input, sourceType: 'mention', userFks })
}

/**
 * Write a notification for somebody who cannot read the region it names: a member who was
 * removed, an invitee who has not joined. A send queue rather than an inbox entry: see the
 * `notificationSourceType` doc in `schema.ts` for why, and {@link retractOutOfBand} for the undo.
 *
 * {@link notify} cannot write either of them, and that is not an oversight in it: its recipient
 * rule is `region.read`, which both of these recipients fail by definition, so it would correctly
 * decide there is nobody to tell.
 */
export async function notifyOutOfBand(input: {
  actorFk: number
  regionFk: number
  sourceType: NotificationSourceType
  /** The one person told. Not filtered against anything: the caller already knows who they are. */
  userFk: number
}): Promise<void> {
  // Not from `region_members`, which is the point: this recipient either recently lost that row or
  // never had one. `users` is where the auth id lives for everybody else.
  const recipient = await baseDb.query.users.findFirst({
    columns: { authUserFk: true },
    where: eq(users.id, input.userFk),
  })

  if (recipient?.authUserFk == null) {
    return
  }

  await baseDb
    .insert(notifications)
    .values({
      actorFk: input.actorFk,
      authUserFk: recipient.authUserFk,
      regionFk: input.regionFk,
      sourceType: input.sourceType,
      // The recipient, in the object columns, exactly as a role change files it. Nothing renders
      // these rows, but it keeps the shape uniform for anything reading one back.
      subjectFk: input.userFk,
      userFk: input.userFk,
    })
    // Same re-arm as {@link notify}: a second removal from the same region by the same admin is
    // news only once the first has gone out. `region_fk` is in the key, so being removed from two
    // regions is two rows rather than one that names the wrong place.
    .onConflictDoUpdate({
      set: { createdAt: new Date(), pushedAt: null, readAt: null },
      setWhere: isNotNull(notifications.readAt),
      target: [
        notifications.userFk,
        notifications.sourceType,
        notifications.actorFk,
        notifications.regionFk,
        notifications.eventFk,
        notifications.areaFk,
        notifications.ascentFk,
        notifications.blockFk,
        notifications.fileFk,
        notifications.routeFk,
        notifications.subjectFk,
      ],
    })
}

/**
 * The regions each of these people may be told about: active membership AND a role that
 * holds `region.read`, which is what the `events` SELECT policy requires.
 *
 * Same rule as {@link notificationRecipients}, from the other end. Push needs it because "the
 * regions I am a member of" is a looser set: revoke `region.read` from a role and its members
 * would keep receiving pushes naming entities they can no longer open.
 *
 * Batched rather than per person, because both halves of the cron ask this of everybody they are
 * about to send to, every five minutes.
 */
export async function readableRegions(userFks: readonly number[]): Promise<Map<number, number[]>> {
  const ids = [...new Set(userFks)]

  if (ids.length === 0) {
    return new Map()
  }

  const rows = await baseDb
    .selectDistinct({ regionFk: regionMembers.regionFk, userFk: regionMembers.userFk })
    .from(regionMembers)
    .innerJoin(rolePermissions, eq(rolePermissions.role, regionMembers.role))
    .where(
      and(
        inArray(regionMembers.userFk, ids),
        eq(regionMembers.isActive, true),
        eq(rolePermissions.permission, REGION_PERMISSION_READ),
      ),
    )

  const byUser = new Map<number, number[]>()
  for (const row of rows) {
    byUser.set(row.userFk, [...(byUser.get(row.userFk) ?? []), row.regionFk])
  }

  return byUser
}

/**
 * Move the inbox rows that were written about one thing onto whatever stands in for it, or take them
 * back when nothing does.
 *
 * Here rather than in the module whose row went away, because what an inbox row IS lives here: one
 * row per (reader, actor, event, object) per source type, pointed at the line it was written about.
 * The caller owns only the question this cannot answer, which is which line may stand in for the one
 * that is gone, and answers it per reader because the sentence is per reader: "Ada answered you",
 * re-pointed at a line of Ada's that answers somebody else, is a claim about something that did not
 * happen.
 *
 * Deleting outright is not enough, because one row covers a whole conversation: an unread row keeps
 * pointing at the FIRST line it was written about, so somebody who says two things and deletes the
 * first would otherwise erase the reader's only notice of the second.
 */
export async function repointNotifications(input: {
  /** The line that went away. */
  reactionFk: number
  /** What should carry the row now, per row, or `undefined` to take it back. */
  replacement: (row: { sourceType: NotificationSourceType; userFk: number }) => number | undefined
  /** Which sentences this is about. A source type left out here is left alone. */
  sourceTypes: readonly NotificationSourceType[]
}): Promise<void> {
  const rows = await baseDb.query.notifications.findMany({
    columns: { id: true, sourceType: true, userFk: true },
    where: and(
      eq(notifications.reactionFk, input.reactionFk),
      inArray(notifications.sourceType, [...input.sourceTypes]),
    ),
  })

  /** Grouped by where they are going, so a thread of readers costs one statement per destination. */
  const moves = new Map<number, number[]>()
  const gone: number[] = []

  for (const row of rows) {
    const to = input.replacement(row)

    if (to == null) {
      gone.push(row.id)
    } else {
      moves.set(to, [...(moves.get(to) ?? []), row.id])
    }
  }

  if (gone.length > 0) {
    await baseDb.delete(notifications).where(inArray(notifications.id, gone))
  }

  for (const [reactionFk, ids] of moves) {
    await baseDb.update(notifications).set({ reactionFk }).where(inArray(notifications.id, ids))
  }
}

/**
 * Take back the rows one actor wrote about one event, for a sentence that no longer has anything
 * behind it.
 *
 * An inbox row about a reaction that no longer exists is a sentence with nothing behind it: the
 * reader taps "Ada reacted to your entry", finds no chip, and has no way to tell whether they
 * misread it or Ada thought better of it. Scoped to this actor's rows on this event, so somebody
 * else's keeps its own.
 */
export async function retractNotifications(input: {
  actorFk: number
  eventFk: number
  /** The line it was about, when the sentence is about one: an emoji on a comment names that comment. */
  reactionFk?: number
  sourceType: NotificationSourceType
}): Promise<void> {
  await baseDb
    .delete(notifications)
    .where(
      and(
        eq(notifications.eventFk, input.eventFk),
        eq(notifications.actorFk, input.actorFk),
        eq(notifications.sourceType, input.sourceType),
        input.reactionFk == null ? undefined : eq(notifications.reactionFk, input.reactionFk),
      ),
    )
}

/**
 * Take back an out-of-band notice that has not gone out yet, which is what an undo is.
 *
 * Scoped to `pushed_at IS NULL`, so it can only cancel, never erase a notice already delivered.
 * The removal snackbar is bounded well below `DIRECTED_DEBOUNCE_MS` (see `MEMBERSHIP_UNDO_MS`), so
 * a row reaching here is always still pending; one that is not is a bug worth leaving visible.
 */
export async function retractOutOfBand(input: {
  regionFk: number
  sourceType: NotificationSourceType
  userFk: number
}): Promise<void> {
  await baseDb
    .delete(notifications)
    .where(
      and(
        eq(notifications.userFk, input.userFk),
        eq(notifications.regionFk, input.regionFk),
        eq(notifications.sourceType, input.sourceType),
        isNull(notifications.pushedAt),
      ),
    )
}
