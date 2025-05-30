import { changePasswordActionSchema, type ActionFailure, type ChangePasswordActionValues } from '$lib/forms/schemas'
import { validateFormData, validatePassword } from '$lib/forms/validate.server'
import { fail } from '@sveltejs/kit'

export const actions = {
  default: async ({ request, locals }) => {
    if (locals.session?.user.email == null) {
      return fail(404)
    }

    const data = await request.formData()
    let values: ChangePasswordActionValues

    try {
      // Validate the form data
      values = await validateFormData(changePasswordActionSchema, data)
    } catch (exception) {
      // Return the validation failure
      return exception as ActionFailure<ChangePasswordActionValues>
    }

    const passwordError = validatePassword(values)
    if (passwordError != null) {
      return fail(400, { ...values, error: passwordError })
    }

    const signInResponse = await locals.supabase.auth.signInWithPassword({
      email: locals.session?.user.email,
      password: values.currentPassword,
    })
    if (signInResponse.error != null) {
      return fail(400, { ...values, error: 'Current password is incorrect' })
    }

    const updateResponse = await locals.supabase.auth.updateUser({ password: values.password })
    if (updateResponse.error != null) {
      return fail(400, { ...values, error: updateResponse.error.message })
    }

    return { success: true }
  },
}
