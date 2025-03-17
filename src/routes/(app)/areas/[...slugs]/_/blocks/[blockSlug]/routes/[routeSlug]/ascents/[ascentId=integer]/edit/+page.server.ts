import { DELETE_PERMISSION, EDIT_PERMISSION } from '$lib/auth'
import { createUpdateActivity } from '$lib/components/ActivityFeed/load.server'
import { handleFileUpload } from '$lib/components/FileUpload/handle.server'
import { config } from '$lib/config'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { activities, ascents } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { ascentActionSchema, validateFormData, type ActionFailure, type AscentActionValues } from '$lib/forms.server'
import { deleteFiles } from '$lib/helper.server'
import { updateRoutesUserData } from '$lib/routes.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'
import { differenceInMinutes } from 'date-fns'

export const load = (async ({ locals, params }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    // Query the database to find the ascent with the given id
    const ascent = await db.query.ascents.findFirst({
      where: eq(ascents.id, Number(params.ascentId)),
      with: {
        author: true,
        route: {
          with: {
            ascents: true,
          },
        },
      },
    })

    if (
      ascent == null ||
      (locals.session?.user.id !== ascent.author.authUserFk && !locals.userPermissions?.includes(EDIT_PERMISSION))
    ) {
      error(404)
    }

    // Return the ascent and route data
    return {
      ascent,
    }
  })
}) satisfies PageServerLoad

export const actions = {
  updateAscent: async ({ locals, params, request }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      const { user } = locals
      if (user == null) {
        return fail(404)
      }

      // Get form data from the request
      const data = await request.formData()
      let values: AscentActionValues

      // Validate the ascent form data
      try {
        values = await validateFormData(ascentActionSchema, data)
      } catch (exception) {
        return exception as ActionFailure<AscentActionValues>
      }

      const ascent = await db.query.ascents.findFirst({
        where: eq(ascents.id, Number(params.ascentId)),
        with: {
          author: true,
          route: true,
        },
      })

      if (
        ascent == null ||
        (locals.session?.user.id !== ascent.author.authUserFk && !locals.userPermissions?.includes(EDIT_PERMISSION))
      ) {
        return fail(404, { ...values, error: `Ascent not found ${params.ascentId}` })
      }

      try {
        // Update the ascent in the database
        await db
          .update(ascents)
          .set({ ...values, routeFk: ascent.route.id })
          .where(eq(ascents.id, ascent.id))

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { folderName, ...rest } = values

        await updateRoutesUserData(ascent.route.id, db)

        if (ascent.createdBy !== user.id || differenceInMinutes(new Date(), ascent.createdAt) > 60) {
          await createUpdateActivity({
            db,
            entityId: String(ascent.id),
            entityType: 'ascent',
            newEntity: rest,
            oldEntity: ascent,
            userFk: user.id,
            parentEntityId: String(ascent.route.id),
            parentEntityType: 'route',
          })
        }
      } catch (exception) {
        return fail(400, { ...values, error: convertException(exception) })
      }

      if (values.folderName != null) {
        try {
          const dstFolder = `${config.files.folders.userContent}/${user.id}`
          const createdFiles = await handleFileUpload(
            db,
            locals.supabase,
            values.folderName!,
            dstFolder,
            values.bunnyVideoIds,
            { ascentFk: ascent.id },
          )

          await Promise.all(
            createdFiles.map(({ file }) =>
              db.insert(activities).values({
                type: 'uploaded',
                userFk: user.id,
                entityId: String(file.id),
                entityType: 'file',
                columnName: 'file',
                parentEntityId: String(ascent.routeFk),
                parentEntityType: 'route',
              }),
            ),
          )
        } catch (exception) {
          // Return a 400 failure if file insertion fails
          return fail(400, { ...values, error: convertException(exception) })
        }
      }

      // Redirect to the merged path
      return `/areas/${params.slugs}/_/blocks/${params.blockSlug}/routes/${params.routeSlug}#activity`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },

  removeAscent: async ({ locals, params }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        return fail(404)
      }

      const ascent = await db.query.ascents.findFirst({
        where: eq(ascents.id, Number(params.ascentId)),
        with: {
          author: true,
        },
      })

      if (
        ascent == null ||
        (locals.session?.user.id !== ascent.author.authUserFk &&
          !locals.userPermissions?.includes(EDIT_PERMISSION) &&
          !locals.userPermissions?.includes(DELETE_PERMISSION))
      ) {
        return fail(404)
      }

      try {
        await deleteFiles({ ascentFk: ascent.id }, db)

        await db.delete(ascents).where(eq(ascents.id, ascent.id))
        await updateRoutesUserData(ascent.routeFk, db)

        await db
          .delete(activities)
          .where(and(eq(activities.entityType, 'ascent'), eq(activities.entityId, String(ascent.id))))
        await db.insert(activities).values({
          type: 'deleted',
          userFk: locals.user.id,
          entityId: String(ascent.id),
          entityType: 'ascent',
          oldValue: ascent.type,
          parentEntityId: String(ascent.routeFk),
          parentEntityType: 'route',
        })
      } catch (error) {
        return fail(400, { error: convertException(error) })
      }

      // Redirect to the merged path
      return `/areas/${params.slugs}/_/blocks/${params.blockSlug}/routes/${params.routeSlug}#activity`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
