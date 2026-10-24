import type { RemovalInput } from '$lib/entities/moderation/dto'
import type * as z from '$lib/forms/zod'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import type { postCommentSchema, toggleReactionSchema } from './dto'

/** Answers whether the reader now holds `emoji` on the target. */
export const toggleReaction = (args: z.input<typeof toggleReactionSchema>) =>
  write<boolean>(mutators.reactions.toggle(args))

/** Answers the new comment's id. */
export const postComment = (args: z.input<typeof postCommentSchema>) =>
  write<number>(mutators.reactions.postComment(args))

/** Answers the id back, which is what Undo restores. */
export const deleteComment = (commentId: number, removal?: RemovalInput) =>
  write<number>(mutators.reactions.deleteComment({ commentId, removal }))

export const restoreComment = (commentId: number) => write(mutators.reactions.restoreComment({ commentId }))
