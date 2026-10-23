import * as z from '$lib/forms/zod'
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
    delete: defineServerMutator(z.object({ id: z.number() }), async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => deleteAscentRow(args, { ...ctx, db }))
    }),
    update: defineServerMutator(ascentActionSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => updateAscentRow(args, { ...ctx, db }))
      return data
    }),
  },
}
