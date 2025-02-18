import type { ActionFailure, ResetPasswordActionValues } from '$lib/forms.server'
import { resetPasswordActionSchema, validateFormData, validatePassword } from '$lib/forms.server'
import { fail } from '@sveltejs/kit'

export const actions = {
  default: async ({ request, locals, url }) => {
    const code = url.searchParams.get('code')
    if (code == null) {
      return fail(400, { error: 'Invalid or expired token' })
    }

    const data = await request.formData()
    let values: ResetPasswordActionValues

    try {
      // Validate the form data
      values = await validateFormData(resetPasswordActionSchema, data)
    } catch (exception) {
      // Return the validation failure
      return exception as ActionFailure<ResetPasswordActionValues>
    }

    const passwordError = validatePassword(values)
    if (passwordError != null) {
      return fail(400, { error: passwordError })
    }

    const verifyResponse = await locals.supabase.auth.verifyOtp({ type: 'recovery', email: values.email, token: code })
    if (verifyResponse.error != null) {
      return fail(400, { error: verifyResponse.error.message })
    }

    const updateResponse = await locals.supabase.auth.updateUser({ password: values.password })
    if (updateResponse.error != null) {
      return fail(400, { error: updateResponse.error.message })
    }

    return { success: true }
  },
}
