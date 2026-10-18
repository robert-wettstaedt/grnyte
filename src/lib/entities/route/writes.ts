import type * as z from '$lib/forms/zod'
import { whileDeleting } from '$lib/zero/deleting.svelte'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import { entityHref } from '../href'
import type { DeleteRouteSnapshot, restoreRouteSchema, RouteFormInput } from './dto'

export const createRoute = (values: RouteFormInput) =>
  write<{ id: number }>(mutators.routes.create(values), { redirectTo: ({ id }) => entityHref('routes', id) })

export const updateRoute = (values: RouteFormInput) =>
  write(mutators.routes.update(values), { redirectTo: entityHref('routes', Number(values.id)) })

export const deleteRoute = (route: { blockFk: number; id: number }) =>
  whileDeleting('routes', route.id, () =>
    write<DeleteRouteSnapshot>(mutators.routes.delete({ id: route.id }), {
      redirectTo: entityHref('blocks', route.blockFk),
    }),
  )

export const restoreRoute = (snapshot: z.input<typeof restoreRouteSchema>) =>
  write<{ routeId: number }>(mutators.routes.restore(snapshot), {
    redirectTo: ({ routeId }) => entityHref('routes', routeId),
  })
