import { fail } from '@sveltejs/kit'

export const actions = {
  default: async ({ request, locals }) => {
    const formData = await request.formData()
    const email = formData.get('email') as string

    const { error } = await locals.supabase.auth.resetPasswordForEmail(email)

    if (error != null) {
      return fail(400, { email, error: error.message })
    }

    return { success: true }
  },
}
