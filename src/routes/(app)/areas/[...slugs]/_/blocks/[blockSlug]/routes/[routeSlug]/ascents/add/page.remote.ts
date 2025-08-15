import { form, getRequestEvent } from '$app/server'
import { insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { handleFileUpload } from '$lib/components/FileUpload/handle.server'
import { config } from '$lib/config'
import { ascents } from '$lib/db/schema'
import { checkExternalSessions, logExternalAscent } from '$lib/external-resources/index.server'
import { enhanceForm, type Action } from '$lib/forms/enhance.server'
import { ascentActionSchema } from '$lib/forms/schemas'
import { updateRoutesUserData } from '$lib/routes.server'
import { error } from '@sveltejs/kit'
import z from 'zod'

export const addAscent = form((data) => enhanceForm(data, addAscentActionSchema, addAscentAction))

const addAscentAction: Action<AddAscentActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()

  const route = await db.query.routes.findFirst({
    where: (table, { eq }) => eq(table.id, values.routeId),
  })

  if (route == null) {
    error(404)
  }

  const externalSessions = await checkExternalSessions(route, locals)

  const [ascent] = await db
    .insert(ascents)
    .values({ ...values, routeFk: route.id, createdBy: user.id, regionFk: route.regionFk })
    .returning()

  if (values.gradeFk != null || values.rating != null) {
    await updateRoutesUserData(route.id, db)
  }

  await insertActivity(db, {
    type: 'created',
    userFk: user.id,
    entityId: String(ascent.id),
    entityType: 'ascent',
    parentEntityId: String(route.id),
    parentEntityType: 'route',
    regionFk: ascent.regionFk,
  })

  if (values.folderName != null) {
    const dstFolder = `${config.files.folders.userContent}/${user.authUserFk}`
    await handleFileUpload(
      db,
      locals.supabase,
      values.folderName!,
      dstFolder,
      { ascentFk: ascent.id, regionFk: ascent.regionFk },
      values.bunnyVideoIds,
    )
  }

  await logExternalAscent(ascent, externalSessions, locals)

  return ['', 'ascents', ascent.id].join('/')
}

type AddAscentActionValues = z.infer<typeof addAscentActionSchema>
const addAscentActionSchema = z.intersection(
  z.object({
    routeId: z.number(),
  }),
  ascentActionSchema,
)
