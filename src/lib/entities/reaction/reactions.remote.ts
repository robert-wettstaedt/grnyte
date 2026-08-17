import { events, reactions } from '$lib/db/schema'
import { authedCommand } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { and, eq, isNull } from 'drizzle-orm'
import z from 'zod'
import { isEmoji } from './dto'

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
    emoji: z.string().refine(isEmoji, 'not a single emoji'),
    eventId: z.number().int().positive(),
  }),
  async ({ emoji, eventId }, { db, user }) => {
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

    // Clear whatever I hold here first, whichever emoji it is, and let the row say what it was.
    // Soft, because the table soft-deletes: `reactions_one_emoji_idx` is partial on
    // `deleted_at is null`, so a cleared row leaves the slot free without losing what it said.
    const cleared = await db
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

    // The same emoji means "take it back". A different one is a change of mind, and falls through
    // to the insert below now that the slot is free.
    if (cleared.some((row) => row.body === emoji)) {
      return { data: false }
    }

    await db.insert(reactions).values({
      authUserFk: user.authUserFk,
      body: emoji,
      eventFk: eventId,
      // Off the event, never off the request: the INSERT policy binds the row to a region the
      // caller may read, and a submitted one would only be checked against itself.
      regionFk: event.regionFk,
      type: 'emoji',
      userFk: user.id,
    })

    return { data: true }
  },
)
