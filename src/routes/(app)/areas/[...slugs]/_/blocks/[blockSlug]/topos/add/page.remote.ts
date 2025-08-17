import { form, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { handleFileUpload } from '$lib/components/FileUpload/handle.server'
import { config } from '$lib/config'
import { topos } from '$lib/db/schema'
import { enhanceForm, type Action } from '$lib/forms/enhance.server'
import { addFileActionSchema } from '$lib/forms/schemas'
import { createGeolocationFromFiles } from '$lib/topo-files.server'
import { error } from '@sveltejs/kit'
import z from 'zod'

export const addTopo = form((data) => enhanceForm(data, addTopoFileActionSchema, addTopoAction))

const addTopoAction: Action<AddTopoFileActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()

  const block = await db.query.blocks.findFirst({
    where: (table, { eq }) => eq(table.id, values.blockId),
  })

  if (block == null) {
    error(404)
  }

  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)) {
    error(401)
  }

  const createdFiles = await handleFileUpload(
    db,
    locals.supabase,
    values.folderName,
    config.files.folders.topos,
    { blockFk: block.id, regionFk: block.regionFk },
    values.bunnyVideoIds,
  )

  const fileBuffers = createdFiles.map((result) => result.fileBuffer).filter((buffer) => buffer != null)

  await createGeolocationFromFiles(db, block, fileBuffers, 'create')
  await Promise.all(
    createdFiles.map((result) =>
      db.insert(topos).values({ blockFk: block.id, fileFk: result.file.id, regionFk: block.regionFk }),
    ),
  )

  await insertActivity(
    db,
    createdFiles.map(({ file }) => ({
      type: 'uploaded',
      userFk: user.id,
      entityId: String(file.id),
      entityType: 'file',
      columnName: 'topo image',
      parentEntityId: String(block.id),
      parentEntityType: 'block',
      regionFk: file.regionFk,
    })),
  )

  return values.redirect != null && values.redirect.length > 0 ? values.redirect : ['', 'blocks', block.id].join('/')
}

type AddTopoFileActionValues = z.infer<typeof addTopoFileActionSchema>
const addTopoFileActionSchema = z.intersection(
  z.object({
    blockId: z.number(),
    redirect: z.string().nullish(),
  }),
  addFileActionSchema,
)
