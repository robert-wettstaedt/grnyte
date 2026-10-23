import * as z from '$lib/forms/zod'
import { asCaller, defineServerMutator } from '$lib/zero/serverMutator.server'
import { createTopoSchema, reorderToposSchema, replaceTopoImageSchema, saveTopoLinesSchema } from './dto'
import { createTopoRow, deleteTopoRow, reorderToposRow, replaceTopoImageRow, saveTopoLinesRow } from './edit.server'

export const toposServerMutatorDefs = {
  topos: {
    create: defineServerMutator(createTopoSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => createTopoRow(args, { ...ctx, db }))
      return data
    }),
    delete: defineServerMutator(z.object({ id: z.number() }), async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => deleteTopoRow(args, { ...ctx, db }))
    }),
    reorder: defineServerMutator(reorderToposSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => reorderToposRow(args, { ...ctx, db }))
    }),
    replaceImage: defineServerMutator(replaceTopoImageSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => replaceTopoImageRow(args, { ...ctx, db }))
      return data
    }),
    saveLines: defineServerMutator(saveTopoLinesSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => saveTopoLinesRow(args, { ...ctx, db }))
    }),
  },
}
