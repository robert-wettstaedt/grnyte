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
import { and, eq, inArray } from 'drizzle-orm'
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
  /** Whatever the sentence needs that the entity cannot answer, e.g. the granted role. */
  metadata?: string
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
        metadata: input.metadata,
        regionFk: input.regionFk,
        sourceType: input.sourceType,
        userFk: recipient.userFk,
      })),
    )
    // The unique index is what makes a re-save idempotent: opening a description in the markdown
    // editor and saving it again re-emits the same `!users:N!` refs, and without this that
    // re-notifies everyone mentioned, every time.
    .onConflictDoNothing()
}

/**
 * Tell everybody named in a markdown body that they were named in it.
 *
 * The refs are read off the body as saved, not off the difference from the previous one: an edit
 * that adds a name has to notify it, and an edit that keeps one must not notify it twice. The
 * unique index in {@link notify} is what makes the second half true, so this stays a plain read.
 */
export async function notifyMentions(input: {
  actorFk: number
  /** The markdown as stored. `null`/`undefined` (a cleared description) mentions nobody. */
  body: null | string | undefined
  entityId: number | string
  entityType: NotificationEntityType
  regionFk: number
}): Promise<void> {
  const userFks = input.body == null ? [] : getReferences(input.body).users

  if (userFks.length === 0) {
    return
  }

  await notify({ ...input, sourceType: 'mention', userFks })
}

/**
 * The regions this person may actually be told about: active membership AND a role that holds
 * `region.read`, which is what the `activities` SELECT policy requires.
 *
 * Same rule as {@link notificationRecipients}, from the other end. The digest needs it because
 * "the regions I am a member of" is a looser set: revoke `region.read` from a role and its members
 * would keep receiving pushes naming entities they can no longer open.
 */
export async function readableRegions(userFk: number): Promise<number[]> {
  const rows = await baseDb
    .selectDistinct({ regionFk: regionMembers.regionFk })
    .from(regionMembers)
    .innerJoin(rolePermissions, eq(rolePermissions.role, regionMembers.role))
    .where(
      and(
        eq(regionMembers.userFk, userFk),
        eq(regionMembers.isActive, true),
        eq(rolePermissions.permission, REGION_PERMISSION_READ),
      ),
    )

  return rows.map((row) => row.regionFk)
}
