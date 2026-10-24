import type { QueryContext } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineMutator } from '@rocicorp/zero'
import { commentIdSchema, deleteCommentSchema, postCommentSchema, toggleReactionSchema } from './dto'

const waitForServer = async () => {}

export const reactionsMutatorDefs = {
  reactions: {
    deleteComment: defineMutator(deleteCommentSchema, waitForServer),
    postComment: defineMutator(postCommentSchema, waitForServer),
    restoreComment: defineMutator(commentIdSchema, waitForServer),
    // The chip flips locally: clear what this reader holds on the target, then add the new emoji
    // unless it was the one they held. The server's rows replace these when they sync.
    toggle: defineMutator(toggleReactionSchema, async ({ args, ctx, tx }) => {
      const event = await tx.run(zql.events.where('id', args.eventId).one())
      if (args.userId == null || event == null) return

      const slot = zql.reactions
        .where('eventFk', args.eventId)
        .where('userFk', args.userId)
        .where('type', 'emoji')
        .where('deletedAt', 'IS', null)
      const held = await tx.run(
        args.commentId == null ? slot.where('parentFk', 'IS', null) : slot.where('parentFk', args.commentId),
      )
      for (const row of held) {
        await tx.mutate.reactions.update({ deletedAt: Date.now(), id: row.id })
      }
      if (held.some((row) => row.body === args.emoji)) return

      await tx.mutate.reactions.upsert({
        // shortcut: Zero's context is untyped until `DefaultTypes.context` is registered.
        authUserFk: (ctx as QueryContext | undefined)?.authUserId ?? '',
        body: args.emoji,
        createdAt: Date.now(),
        deletedAt: null,
        eventFk: args.eventId,
        // Negative, and one per target, so it never meets a serial id or another target's guess;
        // upserted, because a re-tap before the server's row syncs lands on the row it soft-deleted.
        id: args.commentId == null ? -2 * args.eventId : -2 * args.commentId - 1,
        parentFk: args.commentId ?? null,
        regionFk: event.regionFk,
        type: 'emoji',
        userFk: args.userId,
      })
    }),
  },
}
