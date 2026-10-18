import { zql } from '$lib/zero/zero-schema.gen'
import { defineMutator } from '@rocicorp/zero'
import { deleteFileSchema, fileVisibilitySchema, videoSourceSchema } from './dto'

const waitForServer = async () => {}

export const filesMutatorDefs = {
  files: {
    // The storage teardown is the server's alone, so a delete waits for it.
    delete: defineMutator(deleteFileSchema, waitForServer),
    setVideoSource: defineMutator(videoSourceSchema, waitForServer),
    // A toggle: the switch flips locally, and the server's answer replaces it.
    setVisibility: defineMutator(fileVisibilitySchema, async ({ args, tx }) => {
      if ((await tx.run(zql.files.where('id', args.fileId).one())) != null) {
        await tx.mutate.files.update({ id: args.fileId, visibility: args.visibility })
      }
    }),
  },
}
