import type { RemovalInput } from '$lib/entities/moderation/dto'
import type * as z from '$lib/forms/zod'
import { whileDeleting } from '$lib/zero/deleting.svelte'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import { entityHref } from '../href'
import type {
  BlockFormInput,
  DeleteBlockSnapshot,
  mergeBlocksSchema,
  moveBlocksSchema,
  restoreBlockSchema,
} from './dto'

type Pin = { id: number; lat: number; long: number }

/** Lands on the survivor: the source is gone once this answers. */
export const mergeBlocks = (values: z.input<typeof mergeBlocksSchema>) =>
  write(mutators.blocks.merge(values), { redirectTo: entityHref('blocks', values.survivorId) })

/** Answers each source area's slot order from before, which its Undo passes back as `restoreOrder`. */
export const moveBlocks = (values: z.input<typeof moveBlocksSchema>) =>
  write<{ previous: { areaId: number; order: number[] }[] }>(mutators.blocks.move(values))

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
export const deleteBlock = (block: { areaFk: number; id: number }, removal?: RemovalInput) =>
  whileDeleting('blocks', block.id, () =>
    write<DeleteBlockSnapshot>(mutators.blocks.delete({ id: block.id, removal }), {
      redirectTo: entityHref('areas', block.areaFk),
    }),
  )

export const restoreBlock = (snapshot: z.input<typeof restoreBlockSchema>) =>
  write<{ blockId: number }>(mutators.blocks.restore(snapshot), {
    redirectTo: ({ blockId }) => entityHref('blocks', blockId),
  })
