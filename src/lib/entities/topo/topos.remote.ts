import * as z from '$lib/forms/zod'
import { authedCommand } from '$lib/remote/authed.server'
import { createTopoSchema, reorderToposSchema, replaceTopoImageSchema, saveTopoLinesSchema } from './dto'
import { createTopoRow, deleteTopoRow, reorderToposRow, replaceTopoImageRow, saveTopoLinesRow } from './edit.server'

// The bodies live in `edit.server.ts`, shared with the topo mutators; these stay one release so
// tabs loaded before the mutators keep their endpoints.

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const createTopo = authedCommand(createTopoSchema, (args, ctx) => createTopoRow(args, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const deleteTopo = authedCommand(z.object({ id: z.number() }), (args, ctx) => deleteTopoRow(args, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const replaceTopoImage = authedCommand(replaceTopoImageSchema, (args, ctx) => replaceTopoImageRow(args, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const reorderTopos = authedCommand(reorderToposSchema, (args, ctx) => reorderToposRow(args, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const saveTopoLines = authedCommand(saveTopoLinesSchema, (args, ctx) => saveTopoLinesRow(args, ctx))
