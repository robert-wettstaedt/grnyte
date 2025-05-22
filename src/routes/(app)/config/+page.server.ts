import { APP_PERMISSION_ADMIN, checkAppPermission } from '$lib/auth'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { routesToTags, tags } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { tagActionSchema, validateFormData, type ActionFailure, type TagActionValues } from '$lib/forms.server'
import { error, fail } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals }) => {
  if (!checkAppPermission(locals.userPermissions, [APP_PERMISSION_ADMIN])) {
    error(404)
  }

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const regionMembers = await db.query.regionMembers.findMany()
    const regions = await db.query.regions.findMany({
      orderBy: (table, { asc }) => [asc(table.id)],
    })
    const tags = await db.query.tags.findMany({
      orderBy: (table, { asc }) => [asc(table.id)],
    })
    const users = await db.query.users.findMany({
      orderBy: (table, { asc }) => [asc(table.id)],
    })

    return {
      regionMembers,
      regions,
      tags,
      users,
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
        await db.delete(tags).where(eq(tags.id, values.id))
        await db.delete(routesToTags).where(eq(routesToTags.tagFk, values.id))
      } catch (exception) {
        return fail(400, { ...values, error: convertException(exception) })
      }
    })
  },
}
