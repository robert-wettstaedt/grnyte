import { db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { createUserActionSchema, type CreateUserActionValues } from '$lib/forms/schemas'
import { validateFormData, validatePassword, validateUsername } from '$lib/forms/validate.server'
import { notifyNewUser } from '$lib/notifications/samples.server.js'
import { fail, type ActionFailure } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'

export const actions = {
  default: async (event) => {
    const { request, locals } = event
    const data = await request.formData()
    let values: CreateUserActionValues

    try {
      // Validate the form data
      values = await validateFormData(createUserActionSchema, data)
    } catch (exception) {
      // Return the validation failure
      return exception as ActionFailure<CreateUserActionValues>
    }

    const passwordError = validatePassword(values)
    if (passwordError != null) {
      return fail(400, { email: values.email, username: values.username, error: passwordError })
    }

    const usernameError = await validateUsername(values.username, db)
    if (usernameError != null) {
      return fail(400, { email: values.email, username: values.username, error: usernameError })
    }

    const signUpData = await locals.supabase.auth.signUp({ email: values.email, password: values.password })

    if (signUpData.error != null) {
      return fail(400, { email: values.email, username: values.username, error: signUpData.error.message })
    }

    if (signUpData.data.user != null) {
      try {
        const [createdUser] = await db
          .insert(schema.users)
          .values({ authUserFk: signUpData.data.user.id, username: values.username })
          .returning()
        const [createdUserSettings] = await db
          .insert(schema.userSettings)
          .values({ userFk: createdUser.id, authUserFk: signUpData.data.user.id })
          .returning()
        await db
          .update(schema.users)
          .set({ userSettingsFk: createdUserSettings.id })
          .where(eq(schema.users.id, createdUser.id))
      } catch (exception) {
        return fail(400, { email: values.email, username: values.username, error: convertException(exception) })
      }

      const appAdmins = await db.query.userRoles.findMany({
        where: eq(schema.userRoles.role, 'app_admin'),
      })

      await Promise.all(
        appAdmins.map((admin) =>
          notifyNewUser(event, { authUserFk: admin.authUserFk, username: values.username, email: values.email }),
        ),
      )

      return { email: values.email, username: values.username, success: true }
    }
  },
}
