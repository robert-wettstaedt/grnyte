import { removableIdArgs } from '$lib/entities/moderation/dto'
import { recordPlanned } from '$lib/entities/moderation/record.server'
import { asCaller, defineServerMutator } from '$lib/zero/serverMutator.server'
import { ascentActionSchema } from './dto'
import { deleteAscentRow } from './lifecycle.server'
import { createAscentRow, updateAscentRow } from './save.server'

export const ascentsServerMutatorDefs = {
  ascents: {
    create: defineServerMutator(ascentActionSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => createAscentRow(args, { ...ctx, db }))
      return data
    }),
    delete: defineServerMutator(removableIdArgs, async ({ args, ctx, tx }) => {
      const { removal } = await asCaller(tx, ctx, (db) => deleteAscentRow(args, { ...ctx, db }))
      await recordPlanned(tx, ctx, removal)
    }),
    update: defineServerMutator(ascentActionSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => updateAscentRow(args, { ...ctx, db }))
      return data
    }),
  },
}
