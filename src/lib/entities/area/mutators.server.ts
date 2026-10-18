import * as z from '$lib/forms/zod'
import { asCaller, defineServerMutator, refuseWithField } from '$lib/zero/serverMutator.server'
import { addParkingSchema, areaActionSchema, restoreAreaSchema, restoreParkingSchema } from './dto'
import { deleteAreaRow, restoreAreaRow } from './lifecycle.server'
import { addParkingRow, deleteParkingRow, restoreParkingRow } from './parking.server'
import { createAreaRow, updateAreaRow } from './save.server'

export const areasServerMutatorDefs = {
  areas: {
    addParking: defineServerMutator(addParkingSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => addParkingRow(args, { ...ctx, db }, refuseWithField))
    }),
    create: defineServerMutator(areaActionSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => createAreaRow(args, { ...ctx, db }, refuseWithField))
      return data
    }),
    delete: defineServerMutator(z.object({ id: z.number() }), async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => deleteAreaRow(args, { ...ctx, db }))
      return data
    }),
    deleteParking: defineServerMutator(z.object({ id: z.number() }), async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => deleteParkingRow(args, { ...ctx, db }))
      return data
    }),
    restore: defineServerMutator(restoreAreaSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => restoreAreaRow(args, { ...ctx, db }))
      return data
    }),
    restoreParking: defineServerMutator(restoreParkingSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => restoreParkingRow(args, { ...ctx, db }))
    }),
    update: defineServerMutator(areaActionSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => updateAreaRow(args, { ...ctx, db }, refuseWithField))
    }),
  },
}
