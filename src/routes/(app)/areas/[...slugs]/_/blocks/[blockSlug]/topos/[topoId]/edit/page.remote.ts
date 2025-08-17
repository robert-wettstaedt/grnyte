import { form, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { handleFileUpload } from '$lib/components/FileUpload/handle.server'
import { config } from '$lib/config'
import { topos } from '$lib/db/schema'
import { enhanceForm, type Action } from '$lib/forms/enhance.server'
import { addFileActionSchema } from '$lib/forms/schemas'
import { deleteFile } from '$lib/nextcloud/nextcloud.server'
import { createGeolocationFromFiles } from '$lib/topo-files.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import z from 'zod'

export const replaceTopo = form((data) => enhanceForm(data, replaceTopoFileActionSchema, replaceTopoAction))

const replaceTopoAction: Action<ReplaceTopoFileActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()

  const topo = await db.query.topos.findFirst({
    where: (table, { eq }) => eq(table.id, values.topoId),
    with: {
      block: true,
      file: true,
    },
  })

  if (topo?.block == null || topo.file == null) {
    error(404)
  }

  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], topo.regionFk)) {
    error(401)
  }

  const createdFiles = await handleFileUpload(
    db,
    locals.supabase,
    values.folderName,
    config.files.folders.topos,
    { blockFk: topo.blockFk, regionFk: topo.regionFk },
    values.bunnyVideoIds,
  )

  const fileBuffers = createdFiles.map((result) => result.fileBuffer).filter((buffer) => buffer != null)

  await createGeolocationFromFiles(db, topo.block, fileBuffers, 'create')
  await Promise.all(
    createdFiles.map((result) =>
      db
        .update(topos)
        .set({ fileFk: result.file.id })
        .where(eq(topos.id, Number(values.topoId))),
    ),
  )

  await deleteFile(topo.file)

  await insertActivity(
    db,
    createdFiles.map(({ file }) => ({
      type: 'uploaded',
      userFk: user.id,
      entityId: String(file.id),
      entityType: 'file',
      columnName: 'topo image',
      parentEntityId: String(topo.blockFk),
      parentEntityType: 'block',
      regionFk: file.regionFk,
    })),
  )

  return values.redirect != null && values.redirect.length > 0
    ? values.redirect
    : ['', 'blocks', topo.blockFk].join('/')
}

type ReplaceTopoFileActionValues = z.infer<typeof replaceTopoFileActionSchema>
const replaceTopoFileActionSchema = z.intersection(
  z.object({
    redirect: z.string().nullish(),
    topoId: z.number(),
  }),
  addFileActionSchema,
)
