import { RESEND_API_KEY, RESEND_RECIPIENT_EMAIL, RESEND_SENDER_EMAIL } from '$env/static/private'
import { db } from '$lib/db/db.server'
import { activities, users, userSettings } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import {
  createUserActionSchema,
  validateFormData,
  validatePassword,
  validateUsername,
  type CreateUserActionValues,
} from '$lib/forms.server'
import { fail, type ActionFailure } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import { Resend } from 'resend'

export const actions = {
  default: async ({ request, locals: { supabase } }) => {
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

    const signUpData = await supabase.auth.signUp({ email: values.email, password: values.password })

    if (signUpData.error != null) {
      return fail(400, { email: values.email, username: values.username, error: signUpData.error.message })
    }

    if (signUpData.data.user != null) {
      try {
        const [createdUser] = await db
          .insert(users)
          .values({ authUserFk: signUpData.data.user.id, username: values.username })
          .returning()
        const [createdUserSettings] = await db
          .insert(userSettings)
          .values({ userFk: createdUser.id, authUserFk: signUpData.data.user.id })
          .returning()
        await db.update(users).set({ userSettingsFk: createdUserSettings.id }).where(eq(users.id, createdUser.id))

        await db.insert(activities).values({
          type: 'created',
          entityId: String(createdUser.id),
          entityType: 'user',
          userFk: createdUser.id,
          newValue: createdUser.username,
        })
      } catch (exception) {
        return fail(400, { email: values.email, username: values.username, error: convertException(exception) })
      }

      if (RESEND_API_KEY && RESEND_RECIPIENT_EMAIL && RESEND_SENDER_EMAIL) {
        const resend = new Resend(RESEND_API_KEY)

        await resend.emails.send({
          from: RESEND_SENDER_EMAIL,
          to: [RESEND_RECIPIENT_EMAIL],
          subject: 'New user',
          html: `A new user just signed up: ${values.username} - ${values.email}`,
        })
      }

      return { email: values.email, username: values.username, success: true }
    }
  },
}
