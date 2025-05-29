import { APP_PERMISSION_ADMIN, checkAppPermission } from '$lib/auth'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { tagActionSchema, type ActionFailure, type TagActionValues } from '$lib/forms/schemas'
import { validateFormData } from '$lib/forms/validate.server'
import { error, fail } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals }) => {
  if (!checkAppPermission(locals.userPermissions, [APP_PERMISSION_ADMIN])) {
    error(404)
  }

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const tags = await db.query.tags.findMany({
      orderBy: (table, { asc }) => [asc(table.id)],
    })

    return {
      tags,
    }
  })
}) satisfies PageServerLoad

export const actions = {
  deleteTag: async ({ locals, request }) => {
    if (!checkAppPermission(locals.userPermissions, [APP_PERMISSION_ADMIN])) {
      error(404)
    }

    const rls = await createDrizzleSupabaseClient(locals.supabase)

    return await rls(async (db) => {
      const data = await request.formData()

      let values: TagActionValues

      try {
        // Validate the form data
        values = await validateFormData(tagActionSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as TagActionFailure
        return exception as ActionFailure<TagActionValues>
      }

      try {
        await db.delete(schema.tags).where(eq(schema.tags.id, values.id))
        await db.delete(schema.routesToTags).where(eq(schema.routesToTags.tagFk, values.id))
      } catch (exception) {
        return fail(400, { ...values, error: convertException(exception) })
      }
    })
  },
}
