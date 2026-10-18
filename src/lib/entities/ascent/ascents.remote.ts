import * as z from '$lib/forms/zod'
import { authedCommand, authedForm } from '$lib/remote/authed.server'
import { ascentActionSchema } from './dto'
import { deleteAscentRow } from './lifecycle.server'
import { createAscentRow, updateAscentRow } from './save.server'

// The bodies live in `save.server.ts` and `lifecycle.server.ts`, shared with the ascent mutators;
// these stay one release so tabs loaded before the mutators keep their endpoints.

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const createAscent = authedForm(ascentActionSchema, (value, ctx) => createAscentRow(value, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const updateAscent = authedForm(ascentActionSchema, (value, ctx) => updateAscentRow(value, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const deleteAscent = authedCommand(z.object({ id: z.number() }), (args, ctx) => deleteAscentRow(args, ctx))
