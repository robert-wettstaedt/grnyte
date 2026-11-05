import type { RemovalInput } from '$lib/entities/moderation/dto'
import type * as z from '$lib/forms/zod'
import { whileDeleting } from '$lib/zero/deleting.svelte'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import { entityHref } from '../href'
import type {
  DeleteRouteSnapshot,
  mergeRoutesSchema,
  moveRoutesSchema,
  restoreRouteSchema,
  RouteFormInput,
} from './dto'

export const createRoute = (values: RouteFormInput) =>
  write<{ id: number }>(mutators.routes.create(values), { redirectTo: ({ id }) => entityHref('routes', id) })

export const updateRoute = (values: RouteFormInput) =>
  write(mutators.routes.update(values), { redirectTo: entityHref('routes', Number(values.id)) })

export const deleteRoute = (route: { blockFk: number; id: number }, removal?: RemovalInput) =>
  whileDeleting('routes', route.id, () =>
    write<DeleteRouteSnapshot>(mutators.routes.delete({ id: route.id, removal }), {
      redirectTo: entityHref('blocks', route.blockFk),
    }),
  )

export const restoreRoute = (snapshot: z.input<typeof restoreRouteSchema>) =>
  write<{ routeId: number }>(mutators.routes.restore(snapshot), {
    redirectTo: ({ routeId }) => entityHref('routes', routeId),
  })

/** Answers each moved route's previous block, which is what its Undo moves them back to. */
export const moveRoutes = (values: z.input<typeof moveRoutesSchema>) =>
  write<{ previous: { blockId: number; id: number }[] }>(mutators.routes.move(values))

/** Lands on the survivor: the source is gone once this answers. */
export const mergeRoutes = (values: z.input<typeof mergeRoutesSchema>) =>
  write(mutators.routes.merge(values), { redirectTo: entityHref('routes', values.survivorId) })
