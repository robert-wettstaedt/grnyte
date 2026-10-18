import * as z from '$lib/forms/zod'
import { authedCommand, authedForm, refuseVia } from '$lib/remote/authed.server'
import { blockActionSchema, blockPinSchema, reorderBlocksSchema, restoreBlockSchema } from './dto'
import { deleteBlockRow, restoreBlockRow } from './lifecycle.server'
import { reorderBlocksRow } from './order.server'
import { estimateBlockLocationRow, setBlockLocationRow } from './pin.server'
import { createBlockRow, updateBlockRow } from './save.server'

// The bodies live in the entity's `*.server.ts` modules, shared with the block mutators; these stay
// one release so tabs loaded before the mutators keep their endpoints.

export const createBlock = authedForm(blockActionSchema, (value, ctx, issue) =>
  createBlockRow(value, ctx, refuseVia(issue)),
)

export const updateBlock = authedForm(blockActionSchema, (value, ctx, issue) =>
  updateBlockRow(value, ctx, refuseVia(issue)),
)

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const setBlockLocation = authedCommand(blockPinSchema, (value, ctx) => setBlockLocationRow(value, ctx))

export const estimateBlockLocationFromPhoto = authedCommand(blockPinSchema, (value, ctx) =>
  estimateBlockLocationRow(value, ctx),
)

export const deleteBlock = authedCommand(z.object({ id: z.number() }), (args, ctx) => deleteBlockRow(args, ctx))

export const restoreBlock = authedCommand(restoreBlockSchema, (snapshot, ctx) => restoreBlockRow(snapshot, ctx))

export const reorderBlocks = authedCommand(reorderBlocksSchema, (value, ctx) => reorderBlocksRow(value, ctx))
