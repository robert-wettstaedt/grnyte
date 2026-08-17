import { events, reactions } from '$lib/db/schema'
import { authedCommand } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { and, eq, isNull } from 'drizzle-orm'
import z from 'zod'
import { COMMENT_MAX_LENGTH, isEmoji, normalizeEmoji } from './dto'
import { dropReactionNotification, notifyComment, notifyReaction } from './reaction.server'

/**
 * Set, change or clear the current user's reaction to one event.
 *
 * ONE per person per event, which `reactions_one_emoji_idx` also enforces. Sending the emoji you
 * already hold clears it; sending a different one replaces it. A reaction is a reading of the
 * thing, and a reader who can stack five of them is not saying five things, they are decorating.
 *
 * An event has an id, so this takes one number. Everything the old shape needed to identify a card
 * (the list of rows it was rendered from, the re-grouping that proved they were one card, the
 * anchor row the reaction was stored against) is gone with it.
 *
 * Returns the new reacted state, so a caller can confirm or revert.
 */
export const toggleReaction = authedCommand(
  z.object({
    // Normalised BEFORE validating, because most of the picker's emoji arrive carrying a variation
    // selector the character does not need, which RGI does not match. See `normalizeEmoji`.
    emoji: z.string().transform(normalizeEmoji).refine(isEmoji, 'not a single emoji'),
    eventId: z.number().int().positive(),
  }),
  async ({ emoji, eventId }, { afterCommit, db, user }) => {
    // Read under RLS, so an event in a region the reactor cannot open is simply not here and this
    // is a 404 rather than a reaction on something unreadable. The gate reads the STORED row, so
    // neither the self-check nor the region the reaction is stamped with comes from the request.
    const event = await requireRow(
      () => db.query.events.findFirst({ where: eq(events.id, eventId) }),
      // Nobody applauds their own event. One actor per event, so this is the whole rule; the old
      // shape had to pick the author of a card's oldest row out of several.
      (row) => row.actorFk !== user.id,
      'Event not found',
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
            isNull(reactions.parentFk),
            isNull(reactions.deletedAt),
          ),
        )
        .returning({ body: reactions.body })

      // The same emoji means "take it back". A different one is a change of mind, and falls
      // through to the insert below now that the slot is free.
      if (cleared.some((row) => row.body === emoji)) {
        // And the inbox row goes with it: see `dropReactionNotification`. On the privileged
        // handle, so it needs a connection this transaction is not holding.
        afterCommit(() => dropReactionNotification({ actorFk: user.id, eventFk: eventId }))
        return { data: false }
      }

      await tx.insert(reactions).values({
        authUserFk: user.authUserFk,
        body: emoji,
        eventFk: eventId,
        // Off the event, never off the request: the INSERT policy binds the row to a region the
        // caller may read, and a submitted one would only be checked against itself.
        regionFk: event.regionFk,
        type: 'emoji',
        userFk: user.id,
      })

      // Last, and outside the transaction: `notify` runs on the privileged handle, because there
      // is no INSERT policy on `notifications` and deliberately cannot be one.
      afterCommit(() => notifyReaction({ actorFk: user.id, event }))

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
 * ponytail: flat. `parent_fk` is in the schema and the fan-out already reaches everybody in the
 * thread, so a reply UI is additive; what it would need is an indent and a target. Nothing today
 * writes a comment with a parent, and the feed's chips deliberately do not sync one.
 */
export const postComment = authedCommand(
  z.object({
    body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
    eventId: z.number().int().positive(),
  }),
  async ({ body, eventId }, { afterCommit, db, user }) => {
    // Read under RLS, exactly as the toggle does: an event the commenter cannot open is not here,
    // and the region the row is stamped with is the stored one rather than a submitted one.
    const event = await requireRow(
      () => db.query.events.findFirst({ where: eq(events.id, eventId) }),
      () => true,
      'Event not found',
    )

    const [row] = await db
      .insert(reactions)
      .values({
        authUserFk: user.authUserFk,
        body,
        eventFk: eventId,
        regionFk: event.regionFk,
        type: 'comment',
        userFk: user.id,
      })
      .returning({ id: reactions.id })

    // Everybody already in the conversation, worked out from the comments themselves rather than
    // from a subscription table. Runs after the insert, so the author of THIS comment is among the
    // candidates and is dropped by `notify` as the actor.
    afterCommit(() => notifyComment({ actorFk: user.id, event, reactionFk: row.id }))

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
  async ({ commentId }, { db, user }) => {
    await requireRow(
      () => db.query.reactions.findFirst({ where: eq(reactions.id, commentId) }),
      // Your own, and still a comment: the emoji half has its own path through `toggleReaction`.
      (row) => row.userFk === user.id && row.type === 'comment',
      'Comment not found',
    )

    await db.update(reactions).set({ deletedAt: new Date() }).where(eq(reactions.id, commentId))
  },
)
