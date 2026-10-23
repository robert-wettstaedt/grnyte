import { authedForm } from '$lib/remote/authed.server'
import { ascentActionSchema } from './dto'
import { createAscentRow, updateAscentRow } from './save.server'

// The bodies live in `save.server.ts`, shared with the ascent mutators; these stay one release so
// tabs loaded before the mutators keep their endpoints.

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const createAscent = authedForm(ascentActionSchema, (value, ctx) => createAscentRow(value, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const updateAscent = authedForm(ascentActionSchema, (value, ctx) => updateAscentRow(value, ctx))
