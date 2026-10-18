import type * as z from '$lib/forms/zod'
import { whileDeleting } from '$lib/zero/deleting.svelte'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import { entityHref } from '../href'
import type { BlockFormInput, DeleteBlockSnapshot, restoreBlockSchema } from './dto'

type Pin = { id: number; lat: number; long: number }

export const createBlock = (values: BlockFormInput) =>
  write<{ id: number }>(mutators.blocks.create(values), { redirectTo: ({ id }) => entityHref('blocks', id) })

export const updateBlock = (values: BlockFormInput) =>
  write(mutators.blocks.update(values), { redirectTo: entityHref('blocks', Number(values.id)) })

export const setBlockLocation = (pin: Pin) =>
  write(mutators.blocks.setLocation(pin), { redirectTo: entityHref('blocks', pin.id) })

/** A rough pin from a topo photo; a no-op once the block has one. Stays on the screen. */
export const estimateBlockLocation = (pin: Pin) => write(mutators.blocks.estimateLocation(pin))

export const reorderBlocks = (areaId: number, orderedIds: number[]) =>
  write(mutators.blocks.reorder({ areaId, orderedIds }), { redirectTo: entityHref('areas', areaId) })

/** Leaves for the block's area. */
export const deleteBlock = (block: { areaFk: number; id: number }) =>
  whileDeleting('blocks', block.id, () =>
    write<DeleteBlockSnapshot>(mutators.blocks.delete({ id: block.id }), {
      redirectTo: entityHref('areas', block.areaFk),
    }),
  )

export const restoreBlock = (snapshot: z.input<typeof restoreBlockSchema>) =>
  write<{ blockId: number }>(mutators.blocks.restore(snapshot), {
    redirectTo: ({ blockId }) => entityHref('blocks', blockId),
  })
