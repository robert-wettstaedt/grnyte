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
import { notifications, regionMembers, rolePermissions } from '$lib/db/schema'
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { NotificationEntityType, NotificationSourceType } from './dto'

/** One recipient, in both the shapes a row needs: the app's id and the one RLS compares. */
export interface NotificationRecipient {
  authUserFk: string
  userFk: number
}

/** What a mutation hands over: who did what to which entity, and who might want to know. */
export interface NotifyInput {
  /** Who caused it. Dropped from the recipients, so nobody is told about their own edit. */
  actorFk: number
  entityId: number | string
  entityType: NotificationEntityType
  /**
   * Which card, for the source types that are about one. Part of the idempotency key, so two
   * reactions on two events about the same route stay two rows.
   */
  eventFk?: number
  /** Whatever the sentence needs that the entity cannot answer, e.g. the granted role. */
  metadata?: string
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
 * Mirrors the `activities` SELECT policy exactly (`authorize_in_region('region.read', region_fk)`,
 * which resolves to an active `region_members` row whose role holds that permission), because
 * anything looser notifies somebody about a region they cannot open. Exported so the test can
 * hold it against who can really `SELECT` the row rather than trusting this to have got it right.
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
 * Write one notification per recipient who can actually see the thing it is about.
 *
 * Runs on the privileged handle rather than the caller's RLS transaction, which is forced: there
 * is no INSERT policy on `notifications` and there deliberately cannot be one. An own-rows policy
 * would reject a row the actor is writing for somebody else, and anything wider would let anyone
 * holding a JWT post into a stranger's inbox.
 *
 * ponytail: that also puts the write outside the mutation's transaction, so a handler that fails
 * AFTER calling this leaves a notification for a change that rolled back. Call it last, which
 * every call site does. Upgrade = a queue the mutation enrolls in, if that ever actually bites.
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
        entityId: String(input.entityId),
        entityType: input.entityType,
        eventFk: input.eventFk,
        metadata: input.metadata,
        reactionFk: input.reactionFk,
        regionFk: input.regionFk,
        sourceType: input.sourceType,
        userFk: recipient.userFk,
      })),
    )
    // The unique index collapses the same event fired twice in a row, e.g. a double submit, or a
    // maintainer who saves the same edit again a minute later. It is a backstop, not the thing that
    // decides what is news: see {@link notifyMentions} for why a source type whose "again" is not a
    // new event has to work that out for itself before it gets here.
    //
    // Collapsed only while the row is still UNREAD, which is the case that idempotency is about.
    // The index carries no time, and a plain `do nothing` would therefore mute a genuinely new
    // event for as long as the old row survives - up to 30 days after a read, 90 unread. Once it
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
      // Whichever of the two partial indexes this row falls under (see `schema.ts`): a row about
      // a card is keyed on the card, everything else on the entity pair.
      ...(input.eventFk == null
        ? {
            target: [
              notifications.userFk,
              notifications.sourceType,
              notifications.entityType,
              notifications.entityId,
              notifications.actorFk,
            ],
            targetWhere: isNull(notifications.eventFk),
          }
        : {
            target: [notifications.userFk, notifications.sourceType, notifications.actorFk, notifications.eventFk],
            targetWhere: isNotNull(notifications.eventFk),
          }),
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
export async function notifyMentions(input: {
  actorFk: number
  /** The markdown as stored. `null`/`undefined` (a cleared description) mentions nobody. */
  body: null | string | undefined
  entityId: number | string
  entityType: NotificationEntityType
  /**
   * The body this save replaced. Anybody named in it has already been told, so they are dropped.
   * Omitted when creating, where there is nothing to have been told about yet. A name that is
   * removed and later written again is a fresh mention, and notifies again.
   */
  previousBody?: null | string
  regionFk: number
}): Promise<void> {
  const before = new Set(input.previousBody == null ? [] : getReferences(input.previousBody).users)
  const userFks = (input.body == null ? [] : getReferences(input.body).users).filter((userFk) => !before.has(userFk))

  if (userFks.length === 0) {
    return
  }

  await notify({ ...input, sourceType: 'mention', userFks })
}

/**
 * The regions each of these people may actually be told about: active membership AND a role that
 * holds `region.read`, which is what the `activities` SELECT policy requires.
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
