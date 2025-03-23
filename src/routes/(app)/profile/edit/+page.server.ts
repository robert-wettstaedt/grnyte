import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { areas, ascents, routes, users } from '$lib/db/schema'
import type { ActionFailure, ProfileActionValues } from '$lib/forms.server'
import { profileActionSchema, validateFormData, validateUsername } from '$lib/forms.server'
import { replaceMention } from '$lib/markdown'
import { fail } from '@sveltejs/kit'
import { eq, ilike } from 'drizzle-orm'

export const actions = {
  default: async ({ request, locals, url }) => {
    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      const { user } = locals
      if (user == null) {
        return fail(404)
      }

      const data = await request.formData()
      let values: ProfileActionValues

      try {
        // Validate the form data
        values = await validateFormData(profileActionSchema, data)
      } catch (exception) {
        // Return the validation failure
        return exception as ActionFailure<ProfileActionValues>
      }

      if (values.username !== user.username) {
        const usernameError = await validateUsername(values.username, db)
        if (usernameError != null) {
          return fail(400, { ...values, error: usernameError })
        }

        await db.update(users).set({ username: values.username }).where(eq(users.id, user.id))

        const searchString = `%@${user.username}%`

        const existingAreas = await db.query.areas.findMany({
          columns: { id: true, description: true },
          where: ilike(areas.description, searchString),
        })
        await Promise.all(
          existingAreas.map((item) =>
            db
              .update(areas)
              .set({ description: replaceMention(item.description, user.username, values.username) })
              .where(eq(areas.id, item.id)),
          ),
        )

        const existingRoutes = await db.query.routes.findMany({
          columns: { id: true, description: true },
          where: ilike(routes.description, searchString),
        })
        await Promise.all(
          existingRoutes.map((item) =>
            db
              .update(routes)
              .set({ description: replaceMention(item.description, user.username, values.username) })
              .where(eq(routes.id, item.id)),
          ),
        )

        const existingAscents = await db.query.ascents.findMany({
          columns: { id: true, notes: true },
          where: ilike(ascents.notes, searchString),
        })
        await Promise.all(
          existingAscents.map((item) =>
            db
              .update(ascents)
              .set({ notes: replaceMention(item.notes, user.username, values.username) })
              .where(eq(ascents.id, item.id)),
          ),
        )
      }

      if (values.email !== locals.session?.user.email) {
        const { error } = await locals.supabase.auth.updateUser(
          { email: values.email },
          { emailRedirectTo: `${url.origin}/profile/edit` },
        )

        if (error != null) {
          return fail(400, { ...values, error: error.message })
        }

        return { success: 'An email has been sent to you to confirm your new email address.' }
      }

      return { success: 'Your profile has been updated successfully.' }
    })

    return returnValue
  },
}
