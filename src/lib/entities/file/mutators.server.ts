import { recordPlanned } from '$lib/entities/moderation/record.server'
import { asCaller, defineServerMutator } from '$lib/zero/serverMutator.server'
import { fileVisibilitySchema, removeFileSchema, videoSourceSchema } from './dto'
import { deleteMediaFileRow, setFileVisibilityRow, setVideoSourceRow } from './edit.server'

export const filesServerMutatorDefs = {
  files: {
    delete: defineServerMutator(removeFileSchema, async ({ args, ctx, tx }) => {
      const { removal } = await asCaller(tx, ctx, (db) => deleteMediaFileRow(args, { ...ctx, db }))
      await recordPlanned(tx, ctx, removal)
    }),
    setVideoSource: defineServerMutator(videoSourceSchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => setVideoSourceRow(args, { ...ctx, db }))
    }),
    // Nothing answered: the updated rows arrive by sync.
    setVisibility: defineServerMutator(fileVisibilitySchema, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => setFileVisibilityRow(args, { ...ctx, db }))
    }),
  },
}
