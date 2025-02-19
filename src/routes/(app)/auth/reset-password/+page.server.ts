import type { ActionFailure, PasswordActionValues } from '$lib/forms.server'
import { passwordActionSchema, validateFormData, validatePassword } from '$lib/forms.server'
import { fail } from '@sveltejs/kit'

export const actions = {
  default: async ({ request, locals }) => {
    const data = await request.formData()
    let values: PasswordActionValues

    try {
      // Validate the form data
      values = await validateFormData(passwordActionSchema, data)
    } catch (exception) {
      // Return the validation failure
      return exception as ActionFailure<PasswordActionValues>
    }

    const passwordError = validatePassword(values)
    if (passwordError != null) {
      return fail(400, { error: passwordError })
    }

    const updateResponse = await locals.supabase.auth.updateUser({ password: values.password })
    if (updateResponse.error != null) {
      return fail(400, { error: updateResponse.error.message })
    }

    return { success: true }
  },
}
