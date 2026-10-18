import { asCaller, defineServerMutator, refuseWithField } from '$lib/zero/serverMutator.server'
import { routeActionSchema } from './dto'
import { updateRouteRow } from './update.server'

export const routesServerMutatorDefs = {
  routes: {
    update: defineServerMutator(routeActionSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => updateRouteRow(args, { ...ctx, db }, refuseWithField))
      return data
    }),
  },
}
