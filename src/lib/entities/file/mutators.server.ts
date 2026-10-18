import { asCaller, defineServerMutator } from '$lib/zero/serverMutator.server'
import { deleteFileSchema, fileVisibilitySchema, videoSourceSchema } from './dto'
import { deleteMediaFileRow, setFileVisibilityRow, setVideoSourceRow } from './edit.server'

export const filesServerMutatorDefs = {
  files: {
    delete: defineServerMutator(deleteFileSchema, async ({ args, ctx, tx }) => {
      const { data } = await asCaller(tx, ctx, (db) => deleteMediaFileRow(args, { ...ctx, db }))
      return data
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
