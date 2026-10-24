import { authedCommand } from '$lib/remote/authed.server'
import { postCommentSchema, toggleReactionSchema } from './dto'
import { postCommentRow, toggleReactionRow } from './edit.server'

// The bodies live in `edit.server.ts`, shared with the reaction mutators; these stay one release so
// tabs loaded before the mutators keep their endpoints.

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const toggleReaction = authedCommand(toggleReactionSchema, (args, ctx) => toggleReactionRow(args, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const postComment = authedCommand(postCommentSchema, (args, ctx) => postCommentRow(args, ctx))
