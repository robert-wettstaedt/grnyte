import { asCaller, defineServerMutator } from '$lib/zero/serverMutator.server'
import { commentIdSchema, postCommentSchema, toggleReactionSchema } from './dto'
import { deleteCommentRow, postCommentRow, restoreCommentRow, toggleReactionRow } from './edit.server'

export const reactionsServerMutatorDefs = {
  reactions: {
    deleteComment: defineServerMutator(commentIdSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => deleteCommentRow(args, { ...ctx, db }))
      return data
    }),
    postComment: defineServerMutator(postCommentSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => postCommentRow(args, { ...ctx, db }))
      return data
    }),
    restoreComment: defineServerMutator(commentIdSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => restoreCommentRow(args, { ...ctx, db }))
    }),
    toggle: defineServerMutator(toggleReactionSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => toggleReactionRow(args, { ...ctx, db }))
      return data
    }),
  },
}
