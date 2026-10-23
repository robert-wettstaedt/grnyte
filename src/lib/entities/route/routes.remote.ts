import { authedForm, refuseVia } from '$lib/remote/authed.server'
import { routeActionSchema } from './dto'
import { createRouteRow, updateRouteRow } from './save.server'

// The bodies live in `save.server.ts`, shared with the route mutators; these stay one release so
// tabs loaded before the mutators keep their endpoints.

export const createRoute = authedForm(routeActionSchema, (value, ctx, issue) =>
  createRouteRow(value, ctx, refuseVia(issue)),
)

export const updateRoute = authedForm(routeActionSchema, (value, ctx, issue) =>
  updateRouteRow(value, ctx, refuseVia(issue)),
)
