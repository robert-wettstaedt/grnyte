import { restoreAreaSchema } from '$lib/entities/area/dto'
import { deleteAreaRow, restoreAreaRow } from '$lib/entities/area/lifecycle.server'
import { restoreBlockSchema } from '$lib/entities/block/dto'
import { deleteBlockRow, restoreBlockRow } from '$lib/entities/block/lifecycle.server'
import { restoreRouteSchema } from '$lib/entities/route/dto'
import { deleteRouteRow, restoreRouteRow } from '$lib/entities/route/lifecycle.server'
import * as z from '$lib/forms/zod'
import { authedCommand } from './authed.server'

// The delete and restore bodies as commands, for tests that drive them through `asRequest` now that
// the app reaches them only through mutators.
const idArgs = z.object({ id: z.number() })

export const deleteArea = authedCommand(idArgs, (args, ctx) => deleteAreaRow(args, ctx))
export const restoreArea = authedCommand(restoreAreaSchema, (snapshot, ctx) => restoreAreaRow(snapshot, ctx))
export const deleteBlock = authedCommand(idArgs, (args, ctx) => deleteBlockRow(args, ctx))
export const restoreBlock = authedCommand(restoreBlockSchema, (snapshot, ctx) => restoreBlockRow(snapshot, ctx))
export const deleteRoute = authedCommand(idArgs, (args, ctx) => deleteRouteRow(args, ctx))
export const restoreRoute = authedCommand(restoreRouteSchema, (snapshot, ctx) => restoreRouteRow(snapshot, ctx))
