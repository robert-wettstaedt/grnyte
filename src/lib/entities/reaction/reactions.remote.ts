import { events, reactions } from '$lib/db/schema'
import { authedCommand } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { and, eq, isNull } from 'drizzle-orm'
import z from 'zod'
import { COMMENT_MAX_LENGTH, isEmoji, normalizeEmoji } from './dto'
import { dropComment, dropReactionNotification, notifyComment, notifyReaction, restoreReplies } from './reaction.server'

/**
 * Set, change or clear the current user's reaction to one event.
 *
 * ONE per person per event, which `reactions_one_emoji_idx` also enforces. Sending the emoji you
 * already hold clears it; sending a different one replaces it. A reaction is a reading of the
 * thing, and a reader who can stack five of them is not saying five things, they are decorating.
 *
 * Returns the new reacted state, so a caller can confirm or revert.
 */
export const toggleReaction = authedCommand(
  z.object({
    /** A comment on that event, when the reaction is on what somebody SAID rather than on the card. */
    commentId: z.number().int().positive().optional(),
    // Normalised BEFORE validating, because most of the picker's emoji arrive carrying a variation
    // selector the character does not need, which RGI does not match. See `normalizeEmoji`.
    emoji: z.string().transform(normalizeEmoji).refine(isEmoji, 'not a single emoji'),
    eventId: z.number().int().positive(),
  }),
  async ({ commentId, emoji, eventId }, { afterCommit, db, user }) => {
    // Read under RLS, so an event in a region the reactor cannot open is simply not here and this
    // is a 404 rather than a reaction on something unreadable. The gate reads the STORED row, so
    // neither the self-check nor the region the reaction is stamped with comes from the request.
    const event = await requireRow(
      () => db.query.events.findFirst({ where: eq(events.id, eventId) }),
      // Nobody applauds their own event, and nobody applauds their own comment either. Which of
      // the two is being reacted to decides whose authorship is checked, so the card's rule only
      // applies when the reaction is on the card.
      (row) => commentId != null || row.actorFk !== user.id,
      'Event not found',
    )

    // The comment being reacted to, read under RLS and checked against what is STORED: live, a
    // comment, on this event, and not the reactor's own.
    const comment =
      commentId == null
        ? undefined
        : await requireRow(
            () => db.query.reactions.findFirst({ where: eq(reactions.id, commentId) }),
            (row) =>
              row.type === 'comment' && row.eventFk === eventId && row.deletedAt == null && row.userFk !== user.id,
            'Comment not found',
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

      await tx.insert(reactions).values({
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

      // Last, and outside the transaction: `notify` runs on the privileged handle, because there
      // is no INSERT policy on `notifications` and deliberately cannot be one.
      afterCommit(() => notifyReaction({ actorFk: user.id, comment, event }))

      return { data: true }
    })
  },
)

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
export const postComment = authedCommand(
  z.object({
    body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
    eventId: z.number().int().positive(),
    /** The comment being answered. Absent for a new top-level comment. */
    parentId: z.number().int().positive().optional(),
  }),
  async ({ body, eventId, parentId }, { afterCommit, db, user }) => {
    // Read under RLS, exactly as the toggle does: an event the commenter cannot open is not here,
    // and the region the row is stamped with is the stored one rather than a submitted one.
    const event = await requireRow(
      () => db.query.events.findFirst({ where: eq(events.id, eventId) }),
      () => true,
      'Event not found',
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
            'Comment not found',
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
        parentAuthorFk: parent?.userFk,
        reactionFk: row.id,
      }),
    )

    return { data: row.id }
  },
)

/**
 * Take back your own comment.
 *
 * Soft, like every other delete on this table: a reply that quotes it would otherwise lose what it
 * is answering, and the inbox row about it cascades on a hard delete only.
 */
export const deleteComment = authedCommand(
  z.object({ commentId: z.number().int().positive() }),
  async ({ commentId }, { afterCommit, db, user }) => {
    const comment = await requireRow(
      () => db.query.reactions.findFirst({ where: eq(reactions.id, commentId) }),
      // Your own, still a comment, and still standing: the emoji half has its own path through
      // `toggleReaction`, and re-stamping an already-cleared row would re-fire the notification
      // drop for a comment that has been gone for a week.
      (row) => row.userFk === user.id && row.type === 'comment' && row.deletedAt == null,
      'Comment not found',
    )

    await db.update(reactions).set({ deletedAt: new Date() }).where(eq(reactions.id, commentId))

    // The answers under it, and the inbox rows about all of them, which a soft delete cannot
    // cascade away. On the privileged handle, so it needs a connection this handler is not
    // holding: the answers belong to other people and RLS here is your own rows. See `dropComment`.
    afterCommit(() => dropComment({ actorFk: user.id, eventFk: comment.eventFk, reactionFk: commentId }))

    // The id back, so the caller can offer Undo. See `restoreComment`.
    return { data: commentId }
  },
)

/**
 * Put a comment back, for the Undo the delete offers.
 *
 * A soft delete is what makes this a one-line restore rather than a re-insert: the row, its id,
 * its replies and any reactions on it never left, so nothing that pointed at it has to be rebuilt.
 *
 * Deliberately silent: the thread is not re-notified. Undo happens seconds after a delete that
 * already took the inbox row back, and telling everybody a second time about a sentence they were
 * told about a moment ago is worse than the one lost notification of somebody who mis-tapped.
 */
export const restoreComment = authedCommand(
  z.object({ commentId: z.number().int().positive() }),
  async ({ commentId }, { afterCommit, db, user }) => {
    const comment = await requireRow(
      () => db.query.reactions.findFirst({ where: eq(reactions.id, commentId) }),
      // Cleared, yours, and a comment. Restoring somebody else's, or a row that is not deleted, is
      // not an undo of anything this person did.
      (row) => row.userFk === user.id && row.type === 'comment' && row.deletedAt != null,
      'Comment not found',
    )

    await db.update(reactions).set({ deletedAt: null }).where(eq(reactions.id, commentId))

    // And the answers the delete took with it. Without this, undo puts back a head whose thread is
    // still cleared: `dropComment` soft-deletes the replies too, and they never come back on their
    // own because their authors did not delete them and cannot see them to try.
    //
    // Privileged, for the same reason the cascade is: those rows belong to other people, and RLS
    // on this connection is your own rows.
    afterCommit(() => restoreReplies({ deletedAt: comment.deletedAt as Date, reactionFk: commentId }))
  },
)
