import { DELETE_PERMISSION, EDIT_PERMISSION } from '$lib/auth'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { routesToTags, tags } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { tagActionSchema, validateFormData, type ActionFailure, type TagActionValues } from '$lib/forms.server'
import { error, fail } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const tags = await db.query.tags.findMany()

    return {
      tags,
    }
  })
}) satisfies PageServerLoad

export const actions = {
  delete: async ({ locals, request }) => {
    if (!locals.userPermissions?.includes(EDIT_PERMISSION) && !locals.userPermissions?.includes(DELETE_PERMISSION)) {
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
        await db.delete(tags).where(eq(tags.id, values.id))
        await db.delete(routesToTags).where(eq(routesToTags.tagFk, values.id))
      } catch (exception) {
        return fail(400, { ...values, error: convertException(exception) })
      }
    })
  },
}
