import { asPrivileged, defineServerMutator } from '$lib/zero/serverMutator.server'
import { removalTargetSchema } from './dto'
import { undoRemovalRow } from './undo.server'

export const moderationServerMutatorDefs = {
  moderation: {
    undoRemoval: defineServerMutator(removalTargetSchema, async ({ args, ctx, tx }) => {
      // Privileged: the decision is readable to nobody but the login role; the body gates on its actor.
      await asPrivileged(tx, (db) => undoRemovalRow(args, { ...ctx, db }))
    }),
  },
}
