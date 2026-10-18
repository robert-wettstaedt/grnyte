import * as z from '$lib/forms/zod'
import { asCaller, defineServerMutator, refuseWithField } from '$lib/zero/serverMutator.server'
import { restoreRouteSchema, routeActionSchema } from './dto'
import { deleteRouteRow, restoreRouteRow } from './lifecycle.server'
import { createRouteRow, updateRouteRow } from './save.server'

export const routesServerMutatorDefs = {
  routes: {
    create: defineServerMutator(routeActionSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => createRouteRow(args, { ...ctx, db }, refuseWithField))
      return data
    }),
    delete: defineServerMutator(z.object({ id: z.number() }), async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => deleteRouteRow(args, { ...ctx, db }))
      return data
    }),
    restore: defineServerMutator(restoreRouteSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => restoreRouteRow(args, { ...ctx, db }))
      return data
    }),
    update: defineServerMutator(routeActionSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => updateRouteRow(args, { ...ctx, db }, refuseWithField))
      return data
    }),
  },
}
