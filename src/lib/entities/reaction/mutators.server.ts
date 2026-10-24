import { asCaller, asPrivileged, defineServerMutator } from '$lib/zero/serverMutator.server'
import { commentIdSchema, deleteCommentSchema, postCommentSchema, toggleReactionSchema } from './dto'
import {
  deleteCommentRow,
  postCommentRow,
  restoreCommentRow,
  toggleReactionRow,
  writeCommentDelete,
} from './edit.server'

export const reactionsServerMutatorDefs = {
  reactions: {
    deleteComment: defineServerMutator(deleteCommentSchema, async ({ args, ctx, tx }) => {
      const { data, plan } = await asCaller(tx, ctx, (db) => deleteCommentRow(args, { ...ctx, db }))
      // Gated above on the stored row; clearing its author is past RLS, so only the login role writes it.
      await asPrivileged(tx, (db) => writeCommentDelete(db, plan, ctx.afterCommit))
      return data
    }),
    postComment: defineServerMutator(postCommentSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => postCommentRow(args, { ...ctx, db }))
      return data
    }),
    restoreComment: defineServerMutator(commentIdSchema, async ({ args, ctx, tx }) => {
      // Privileged: the kept copy is readable to nobody but the login role; the body gates on its author.
      await asPrivileged(tx, (db) => restoreCommentRow(args, { ...ctx, db }))
    }),
    toggle: defineServerMutator(toggleReactionSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => toggleReactionRow(args, { ...ctx, db }))
      return data
    }),
  },
}
