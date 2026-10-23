import * as z from '$lib/forms/zod'
import { authedCommand, authedForm, refuseVia } from '$lib/remote/authed.server'
import { invalid } from '@sveltejs/kit'
import { addParkingSchema, areaActionSchema, restoreParkingSchema } from './dto'
import { addParkingRow, deleteParkingRow, restoreParkingRow } from './parking.server'
import { createAreaRow, updateAreaRow } from './save.server'

// The bodies live in `save.server.ts` and `parking.server.ts`, shared with
// the area mutators; these stay one release so tabs loaded before the mutators keep their endpoints.

export const createArea = authedForm(areaActionSchema, (value, ctx, issue) =>
  createAreaRow(value, ctx, refuseVia(issue)),
)

export const updateArea = authedForm(areaActionSchema, (value, ctx, issue) =>
  updateAreaRow(value, ctx, refuseVia(issue)),
)

export const addParking = authedForm(addParkingSchema, (value, ctx) => addParkingRow(value, ctx, invalid))

export const deleteParking = authedCommand(z.object({ id: z.number() }), (args, ctx) => deleteParkingRow(args, ctx))

export const restoreParking = authedCommand(restoreParkingSchema, (snapshot, ctx) => restoreParkingRow(snapshot, ctx))
