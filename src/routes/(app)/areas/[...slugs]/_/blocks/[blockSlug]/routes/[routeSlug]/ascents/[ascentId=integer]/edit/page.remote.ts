import { command, form, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
import { createUpdateActivity, insertActivity } from '$lib/components/ActivityFeed/load.server'
import { handleFileUpload } from '$lib/components/FileUpload/handle.server'
import { config } from '$lib/config'
import { activities, ascents } from '$lib/db/schema'
import { enhance, enhanceForm, type Action } from '$lib/forms/enhance.server'
import { ascentActionSchema, stringToInt } from '$lib/forms/schemas'
import { deleteFiles } from '$lib/helper.server'
import { updateRoutesUserData } from '$lib/routes.server'
import { error } from '@sveltejs/kit'
import { differenceInMinutes } from 'date-fns'
import { and, eq } from 'drizzle-orm'
import z from 'zod'

type EditAscentActionValues = z.infer<typeof editAscentActionSchema>
const editAscentActionSchema = z.intersection(
  z.object({
    ascentId: stringToInt,
  }),
  ascentActionSchema,
)

export const updateAscent = form(editAscentActionSchema, (data) => enhanceForm(data, updateAscentAction))

export const deleteAscent = command(z.number(), (id) => enhance(id, deleteAscentAction))

const updateAscentAction: Action<EditAscentActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()
  const { ascentId, bunnyVideoIds, filePaths, folderName, ...entity } = values

  const ascent = await db.query.ascents.findFirst({
    where: (table, { eq }) => eq(table.id, ascentId),
    with: {
      author: true,
      route: true,
    },
  })

  if (ascent == null) {
    error(404)
  }

  if (
    locals.session?.user.id !== ascent.author.authUserFk &&
    !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_ADMIN], ascent.route.regionFk)
  ) {
    error(401)
  }

  await db
    .update(ascents)
    .set({ ...entity, routeFk: ascent.route.id })
    .where(eq(ascents.id, ascent.id))

  await updateRoutesUserData(ascent.route.id, db)

  if (ascent.createdBy !== user.id || differenceInMinutes(new Date(), ascent.createdAt) > 60) {
    await createUpdateActivity({
      db,
      entityId: String(ascent.id),
      entityType: 'ascent',
      newEntity: entity,
      oldEntity: ascent,
      userFk: user.id,
      parentEntityId: String(ascent.route.id),
      parentEntityType: 'route',
      regionFk: ascent.regionFk,
    })
  }

  if (folderName != null || bunnyVideoIds != null) {
    const dstFolder = `${config.files.folders.userContent}/${user.id}`
    const createdFiles = await handleFileUpload(
      db,
      locals.supabase,
      folderName!,
      dstFolder,
      { ascentFk: ascent.id, regionFk: ascent.regionFk },
      bunnyVideoIds,
    )

    await Promise.all(
      createdFiles.map(({ file }) =>
        insertActivity(db, {
          type: 'uploaded',
          userFk: user.id,
          entityId: String(file.id),
          entityType: 'file',
          columnName: 'file',
          parentEntityId: String(ascent.routeFk),
          parentEntityType: 'route',
          regionFk: file.regionFk,
        }),
      ),
    )
  }

  return ['', 'ascents', ascent.id].join('/')
}

const deleteAscentAction: Action<number> = async (ascentId, db, user) => {
  const { locals } = getRequestEvent()

  const ascent = await db.query.ascents.findFirst({
    where: (table, { eq }) => eq(table.id, ascentId),
    with: {
      author: true,
      route: true,
    },
  })

  if (ascent == null) {
    error(404)
  }

  if (
    locals.session?.user.id !== ascent.author.authUserFk &&
    !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_ADMIN], ascent.route.regionFk)
  ) {
    error(401)
  }

  await deleteFiles({ ascentFk: ascent.id }, db)

  await db.delete(ascents).where(eq(ascents.id, ascent.id))
  await updateRoutesUserData(ascent.routeFk, db)

  await db
    .delete(activities)
    .where(and(eq(activities.entityType, 'ascent'), eq(activities.entityId, String(ascent.id))))
  await insertActivity(db, {
    type: 'deleted',
    userFk: user.id,
    entityId: String(ascent.id),
    entityType: 'ascent',
    oldValue: ascent.type,
    parentEntityId: String(ascent.routeFk),
    parentEntityType: 'route',
    regionFk: ascent.regionFk,
  })

  return ['', 'routes', ascent.routeFk].join('/')
}
