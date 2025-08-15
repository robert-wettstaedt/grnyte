import { form, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { handleFileUpload } from '$lib/components/FileUpload/handle.server'
import { config } from '$lib/config'
import { enhanceForm, type Action } from '$lib/forms/enhance.server'
import { addFileActionSchema } from '$lib/forms/schemas'
import { error } from '@sveltejs/kit'
import z from 'zod'

export const addFile = form((data) => enhanceForm(data, addRouteFileActionSchema, addFileAction))

const addFileAction: Action<AddRouteFileActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()

  const route = await db.query.routes.findFirst({
    where: (table, { eq }) => eq(table.id, values.routeId),
  })

  if (route == null) {
    error(404)
  }

  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], route.regionFk)) {
    error(401)
  }

  const createdFiles = await handleFileUpload(
    db,
    locals.supabase,
    values.folderName,
    config.files.folders.topos,
    { routeFk: route.id, regionFk: route.regionFk },
    values.bunnyVideoIds,
  )

  await Promise.all(
    createdFiles.map(({ file }) =>
      insertActivity(db, {
        type: 'uploaded',
        userFk: user.id,
        entityId: String(file.id),
        entityType: 'file',
        parentEntityId: String(route.id),
        parentEntityType: 'route',
        regionFk: file.regionFk,
      }),
    ),
  )

  return ['', 'routes', route.id].join('/')
}

type AddRouteFileActionValues = z.infer<typeof addRouteFileActionSchema>
const addRouteFileActionSchema = z.intersection(
  z.object({
    routeId: z.number(),
  }),
  addFileActionSchema,
)
