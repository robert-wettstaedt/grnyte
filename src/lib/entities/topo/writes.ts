import type * as z from '$lib/forms/zod'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import type { reorderToposSchema, saveTopoLinesSchema } from './dto'

export const createTopo = (blockId: number, fileId: string) =>
  write<{ id: number }>(mutators.topos.create({ blockId, fileId }))

export const replaceTopoImage = (topoId: number, fileId: string) =>
  write<{ id: number }>(mutators.topos.replaceImage({ fileId, topoId }))

export const deleteTopo = (id: number) => write<{ id: number }>(mutators.topos.delete({ id }))

export const reorderTopos = (args: z.input<typeof reorderToposSchema>) => write(mutators.topos.reorder(args))

export const saveTopoLines = (args: z.input<typeof saveTopoLinesSchema>) => write(mutators.topos.saveLines(args))
