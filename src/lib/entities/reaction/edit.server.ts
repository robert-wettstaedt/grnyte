import { checkRegionPermission, REGION_PERMISSION_READ } from '$lib/auth'
import { deletedComments, events, reactions, users, type Reaction } from '$lib/db/schema'
import { canModerate } from '$lib/entities/moderation/permissions'
import { recordRemoval, type Removal } from '$lib/entities/moderation/record.server'
import { planRemoval } from '$lib/entities/moderation/subjects.server'
import { ERASED_COMMENT } from '$lib/entities/user/delete.server'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, eq, isNull } from 'drizzle-orm'
import type { commentIdSchema, deleteCommentSchema, postCommentSchema, toggleReactionSchema } from './dto'
import { dropCommentNotification, dropReactionNotification, notifyComment, notifyReaction } from './reaction.server'

/** A gated comment delete, for {@link writeCommentDelete}; `removal` when an admin removes another's. */
export interface CommentDelete {
  comment: Pick<Reaction, 'body' | 'eventFk' | 'id' | 'userFk'>
  removal?: Removal
}

/**
 * Gates a soft delete, which keeps the row for its replies. {@link writeCommentDelete} writes it,
 * since clearing the author off the row is past what RLS lets even the author do.
 */
export async function deleteCommentRow(
  { commentId, removal }: z.output<typeof deleteCommentSchema>,
  { db, user, userRegions }: Pick<Context, 'db' | 'user' | 'userRegions'>,
): Promise<{ data: number; plan: CommentDelete }> {
  const comment = await requireRow(
    () => db.query.reactions.findFirst({ where: eq(reactions.id, commentId) }),
    // Still a comment, and still standing: the emoji half has its own path through
    // `toggleReaction`, and re-stamping an already-cleared row would re-fire the notification drop.
    (row) =>
      row.type === 'comment' &&
      row.deletedAt == null &&
      (row.userFk === user.id || (removal != null && canModerate(userRegions, row.regionFk))),
    formError('comments_notFound'),
  )

  if (comment.userFk !== user.id && removal != null) {
    const planned = await planRemoval(db, { id: commentId, kind: 'comment', regionFk: comment.regionFk }, removal, {
      user,
      userRegions,
    })
    return { data: commentId, plan: { comment, removal: { ...planned, removedBody: comment.body } } }
  }
  return { data: commentId, plan: { comment } }
}

/**
 * Say something under a card.
 *
 * A row on the same table as the emoji, discriminated by `type`: both are a person, a target and a
 * string, so a second table would only duplicate the target column and the policies.
 *
 * Unlike a reaction, this is allowed on your OWN event. A card is a conversation, and being the
 * person it is about is the most likely reason to have something to say in it.
 *
 * Markdown, with the same `!type:id!` references every description carries, so a comment can name
 * the route it is about and the person it is answering. That is why it notifies twice: the thread
 * hears about the comment, and anybody newly named hears about the mention.
 *
 * One level of replies. `parentId` names the comment being answered; answering a REPLY re-points
 * at that reply's own parent, so the stored shape is a list of comments each with a flat list of
 * answers. A tree is unreadable on a phone and the second level is where the indent runs out.
 */
export async function postCommentRow(
  { body, eventId, parentId }: z.output<typeof postCommentSchema>,
  { afterCommit, db, user }: Pick<Context, 'afterCommit' | 'db' | 'user'>,
) {
  // Read under RLS, exactly as the toggle does: an event the commenter cannot open is not here,
  // and the region the row is stamped with is the stored one rather than a submitted one.
  const event = await requireRow(
    () => db.query.events.findFirst({ where: eq(events.id, eventId) }),
    () => true,
    formError('feed_notFound'),
  )

  // The parent, also read under RLS and also checked against what is STORED: that it is a live
  // comment, and that it hangs off the event this reply claims. Without the second test a reply
  // could be filed under a comment on another card, where nobody in either thread would see it.
  const parent =
    parentId == null
      ? undefined
      : await requireRow(
          () => db.query.reactions.findFirst({ where: eq(reactions.id, parentId) }),
          (row) => row.type === 'comment' && row.eventFk === eventId && row.deletedAt == null,
          formError('comments_notFound'),
        )

  // Answering a reply files under what that reply answers. See the one-level note above.
  const parentFk = parent == null ? null : (parent.parentFk ?? parent.id)

  const [row] = await db
    .insert(reactions)
    .values({
      authUserFk: user.authUserFk,
      body,
      eventFk: eventId,
      parentFk,
      regionFk: event.regionFk,
      type: 'comment',
      userFk: user.id,
    })
    .returning({ id: reactions.id })

  // Everybody already in the conversation, worked out from the comments themselves rather than
  // from a subscription table. Runs after the insert, so the author of THIS comment is among the
  // candidates and is dropped by `notify` as the actor.
  //
  // One row per person: whoever is answered is told they were answered and NOT told a second
  // time that somebody commented, and whoever is named is told they were named instead of both.
  // See `notifyComment`.
  afterCommit(() =>
    notifyComment({
      actorFk: user.id,
      body,
      event,
      parentAuthorFk: parent?.userFk ?? undefined,
      reactionFk: row.id,
    }),
  )

  return { data: row.id }
}

/**
 * Put a comment back, for the Undo the delete offers.
 *
 * The row, its id, its replies and its reactions never left, so this only puts the words and the
 * author back from `deleted_comments`; nothing that pointed at it has to be rebuilt.
 *
 * Deliberately silent: the thread is not re-notified. Undo happens seconds after a delete that
 * already took the inbox row back, and telling everybody a second time about a sentence they were
 * told about a moment ago is worse than the one lost notification of somebody who mis-tapped.
 */
export async function restoreCommentRow(
  { commentId }: z.output<typeof commentIdSchema>,
  { db, user, userRegions }: Pick<Context, 'db' | 'user' | 'userRegions'>,
) {
  const { kept } = await requireRow(
    async () => {
      const row = await db.query.reactions.findFirst({ where: eq(reactions.id, commentId) })
      const [kept] = await db
        .select({ authUserFk: users.authUserFk, body: deletedComments.body, userFk: deletedComments.userFk })
        .from(deletedComments)
        .innerJoin(users, eq(users.id, deletedComments.userFk))
        .where(eq(deletedComments.reactionFk, commentId))
      return row && { ...row, kept }
    },
    // Your own delete, still inside its day, in a region you can still read: an admin's removal
    // keeps no copy here, and the cleanup drops this one when the Undo runs out.
    (row) =>
      row.type === 'comment' &&
      row.deletedAt != null &&
      row.kept?.userFk === user.id &&
      checkRegionPermission(userRegions, [REGION_PERMISSION_READ], row.regionFk),
    formError('comments_notFound'),
  )
  // The gate already proved it; this narrows the type without hiding a gate bug.
  if (kept == null) error(403, formError('form_noPermission'))

  await db
    .update(reactions)
    .set({ authUserFk: kept.authUserFk, body: kept.body, deletedAt: null, removedBy: null, userFk: kept.userFk })
    .where(eq(reactions.id, commentId))
  await db.delete(deletedComments).where(eq(deletedComments.reactionFk, commentId))
}

/**
 * Set, change or clear the current user's reaction to one event.
 *
 * ONE per person per event, which `reactions_one_emoji_idx` also enforces. Sending the emoji you
 * already hold clears it; sending a different one replaces it. A reaction is a reading of the
 * thing, and a reader who can stack five of them is not saying five things, they are decorating.
 *
 * Returns the new reacted state, so a caller can confirm or revert.
 */
export async function toggleReactionRow(
  { commentId, emoji, eventId }: z.output<typeof toggleReactionSchema>,
  { afterCommit, db, user }: Pick<Context, 'afterCommit' | 'db' | 'user'>,
) {
  // Read under RLS, so an event in a region the reactor cannot open is not here and this
  // is a 404 rather than a reaction on something unreadable. The gate reads the STORED row, so
  // neither the self-check nor the region the reaction is stamped with comes from the request.
  const event = await requireRow(
    () => db.query.events.findFirst({ where: eq(events.id, eventId) }),
    // Nobody applauds their own event, and nobody applauds their own comment either. Which of
    // the two is being reacted to decides whose authorship is checked, so the card's rule only
    // applies when the reaction is on the card.
    (row) => commentId != null || row.actorFk !== user.id,
    formError('feed_notFound'),
  )

  // The comment being reacted to, read under RLS and checked against what is STORED: live, a
  // comment, on this event, and not the reactor's own.
  const comment =
    commentId == null
      ? undefined
      : await requireRow(
          () => db.query.reactions.findFirst({ where: eq(reactions.id, commentId) }),
          (row) => row.type === 'comment' && row.eventFk === eventId && row.deletedAt == null && row.userFk !== user.id,
          formError('comments_notFound'),
        )

  // One transaction, because the clear and the insert are one act. Apart, a failing insert
  // (a lost connection, a racing tap) leaves the reader holding nothing when they meant to
  // change their mind, and are told nothing about it.
  return db.transaction(async (tx) => {
    // Clear whatever I hold here first, whichever emoji it is, and let the row say what it was.
    // Soft, because the table soft-deletes: `reactions_one_emoji_idx` is partial on
    // `deleted_at is null`, so a cleared row leaves the slot free without losing what it said.
    const cleared = await tx
      .update(reactions)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(reactions.eventFk, eventId),
          eq(reactions.userFk, user.id),
          eq(reactions.type, 'emoji'),
          // The slot is per TARGET, which the unique index spells as `coalesce(parent_fk, 0)`:
          // one emoji on the card, and one more on each comment under it.
          comment == null ? isNull(reactions.parentFk) : eq(reactions.parentFk, comment.id),
          isNull(reactions.deletedAt),
        ),
      )
      .returning({ body: reactions.body })

    // The same emoji means "take it back". A different one is a change of mind, and falls
    // through to the insert below now that the slot is free.
    if (cleared.some((row) => row.body === emoji)) {
      // And the inbox row goes with it: see `dropReactionNotification`. On the privileged
      // handle, so it needs a connection this transaction is not holding.
      afterCommit(() => dropReactionNotification({ actorFk: user.id, commentFk: comment?.id, eventFk: eventId }))
      return { data: false }
    }

    // A racing tap already took the slot (unique index): answer as reacted, notify once.
    const inserted = await tx
      .insert(reactions)
      .values({
        authUserFk: user.authUserFk,
        body: emoji,
        eventFk: eventId,
        parentFk: comment?.id ?? null,
        // Off the event, never off the request: the INSERT policy binds the row to a region the
        // caller may read, and a submitted one would only be checked against itself.
        regionFk: event.regionFk,
        type: 'emoji',
        userFk: user.id,
      })
      .onConflictDoNothing()
      .returning({ id: reactions.id })

    // Last, and outside the transaction: `notify` runs on the privileged handle, because there
    // is no INSERT policy on `notifications` and deliberately cannot be one.
    if (inserted.length > 0) afterCommit(() => notifyReaction({ actorFk: user.id, comment, event }))

    return { data: true }
  })
}

/**
 * Writes a gated delete on the privileged handle. The synced row keeps neither words nor author:
 * an admin's removal keeps them in its decision, an author's own delete in `deleted_comments` for its Undo.
 */
export async function writeCommentDelete(
  db: Context['db'],
  { comment, removal }: CommentDelete,
  afterCommit: Context['afterCommit'],
) {
  // Still standing: a second delete that raced past its gate must not stamp the row again.
  const [written] = await db
    .update(reactions)
    .set({
      authUserFk: null,
      body: ERASED_COMMENT,
      deletedAt: new Date(),
      removedBy: removal == null ? 'author' : 'admin',
      userFk: null,
    })
    .where(and(eq(reactions.id, comment.id), isNull(reactions.deletedAt)))
    .returning({ id: reactions.id })
  if (written == null) error(404, formError('comments_notFound'))
  if (removal == null && comment.userFk != null) {
    await db.insert(deletedComments).values({ body: comment.body, reactionFk: comment.id, userFk: comment.userFk })
  }
  if (removal != null) await recordRemoval(db, removal, afterCommit)

  // The inbox rows about this line go, which a soft delete cannot cascade.
  const author = comment.userFk
  if (author != null) {
    afterCommit(() => dropCommentNotification({ actorFk: author, eventFk: comment.eventFk, reactionFk: comment.id }))
  }
}
