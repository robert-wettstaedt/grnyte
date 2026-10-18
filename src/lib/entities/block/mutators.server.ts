import * as z from '$lib/forms/zod'
import { asCaller, defineServerMutator, refuseWithField } from '$lib/zero/serverMutator.server'
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
    delete: defineServerMutator(z.object({ id: z.number() }), async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => deleteBlockRow(args, { ...ctx, db }))
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
