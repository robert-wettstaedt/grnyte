import { authedCommand } from '$lib/remote/authed.server'
import { commentIdSchema, postCommentSchema, toggleReactionSchema } from './dto'
import { deleteCommentRow, postCommentRow, restoreCommentRow, toggleReactionRow } from './edit.server'

// The bodies live in `edit.server.ts`, shared with the reaction mutators; these stay one release so
// tabs loaded before the mutators keep their endpoints.

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const toggleReaction = authedCommand(toggleReactionSchema, (args, ctx) => toggleReactionRow(args, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const postComment = authedCommand(postCommentSchema, (args, ctx) => postCommentRow(args, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const deleteComment = authedCommand(commentIdSchema, (args, ctx) => deleteCommentRow(args, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const restoreComment = authedCommand(commentIdSchema, (args, ctx) => restoreCommentRow(args, ctx))
