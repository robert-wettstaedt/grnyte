import { removableIdArgs } from '$lib/entities/moderation/dto'
import { recordPlanned } from '$lib/entities/moderation/record.server'
import { refuseWhileRemoved } from '$lib/entities/moderation/undo.server'
import { asCaller, asPrivileged, defineServerMutator, refuseWithField } from '$lib/zero/serverMutator.server'
import { blockActionSchema, blockPinSchema, reorderBlocksSchema, restoreBlockSchema } from './dto'
import { deleteBlockRow, restoreBlockRow } from './lifecycle.server'
import { reorderBlocksRow } from './order.server'
import { estimateBlockLocationRow, setBlockLocationRow } from './pin.server'
import { createBlockRow, updateBlockRow } from './save.server'

export const blocksServerMutatorDefs = {
  blocks: {
    create: defineServerMutator(blockActionSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => createBlockRow(args, { ...ctx, db }, refuseWithField))
      return data
    }),
    delete: defineServerMutator(removableIdArgs, async ({ args, ctx, tx }) => {
      const { data, removal } = await asCaller(tx, ctx, (db) => deleteBlockRow(args, { ...ctx, db }))
      await recordPlanned(tx, ctx, removal)
      return data
    }),
    estimateLocation: defineServerMutator(blockPinSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => estimateBlockLocationRow(args, { ...ctx, db }))
    }),
    reorder: defineServerMutator(reorderBlocksSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => reorderBlocksRow(args, { ...ctx, db }))
    }),
    restore: defineServerMutator(restoreBlockSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => restoreBlockRow(args, { ...ctx, db }))
      if (args.mode === 'soft') await asPrivileged(tx, (db) => refuseWhileRemoved(db, 'block', args.blockId))
      return data
    }),
    setLocation: defineServerMutator(blockPinSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => setBlockLocationRow(args, { ...ctx, db }))
    }),
    update: defineServerMutator(blockActionSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => updateBlockRow(args, { ...ctx, db }, refuseWithField))
    }),
  },
}
