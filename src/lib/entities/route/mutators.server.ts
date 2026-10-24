import { removableIdArgs } from '$lib/entities/moderation/dto'
import { recordPlanned } from '$lib/entities/moderation/record.server'
import { refuseWhileRemoved } from '$lib/entities/moderation/undo.server'
import { asCaller, asPrivileged, defineServerMutator, refuseWithField } from '$lib/zero/serverMutator.server'
import { restoreRouteSchema, routeActionSchema } from './dto'
import { deleteRouteRow, restoreRouteRow } from './lifecycle.server'
import { createRouteRow, updateRouteRow } from './save.server'

export const routesServerMutatorDefs = {
  routes: {
    create: defineServerMutator(routeActionSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => createRouteRow(args, { ...ctx, db }, refuseWithField))
      return data
    }),
    delete: defineServerMutator(removableIdArgs, async ({ args, ctx, tx }) => {
      const { data, removal } = await asCaller(tx, ctx, (db) => deleteRouteRow(args, { ...ctx, db }))
      await recordPlanned(tx, ctx, removal)
      return data
    }),
    restore: defineServerMutator(restoreRouteSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => restoreRouteRow(args, { ...ctx, db }))
      if (args.mode === 'soft') await asPrivileged(tx, (db) => refuseWhileRemoved(db, 'route', args.routeId))
      return data
    }),
    update: defineServerMutator(routeActionSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => updateRouteRow(args, { ...ctx, db }, refuseWithField))
      return data
    }),
  },
}
