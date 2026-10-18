import * as z from '$lib/forms/zod'
import { authedCommand, authedForm } from '$lib/remote/authed.server'
import { invalid } from '@sveltejs/kit'
import { restoreRouteSchema, routeActionSchema } from './dto'
import { deleteRouteRow, restoreRouteRow } from './lifecycle.server'
import { createRouteRow, updateRouteRow, type Refuse } from './save.server'

// The bodies live in `save.server.ts` and `lifecycle.server.ts`, shared with the route mutators;
// these stay one release so tabs loaded before the mutators keep their endpoints.

const refuseVia =
  (issue: { name: (message: string) => Parameters<typeof invalid>[0] }): Refuse =>
  (message, field) =>
    invalid(field == null ? message : issue[field](message))

export const createRoute = authedForm(routeActionSchema, (value, ctx, issue) =>
  createRouteRow(value, ctx, refuseVia(issue)),
)

export const updateRoute = authedForm(routeActionSchema, (value, ctx, issue) =>
  updateRouteRow(value, ctx, refuseVia(issue)),
)

export const deleteRoute = authedCommand(z.object({ id: z.number() }), (args, ctx) => deleteRouteRow(args, ctx))

export const restoreRoute = authedCommand(restoreRouteSchema, (snapshot, ctx) => restoreRouteRow(snapshot, ctx))
