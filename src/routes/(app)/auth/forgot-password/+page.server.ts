import { fail } from '@sveltejs/kit'

export const actions = {
  default: async ({ request, locals, url }) => {
    const formData = await request.formData()
    const email = formData.get('email') as string

    const { error } = await locals.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${url.origin}/auth/reset-password`,
    })

    if (error != null) {
      return fail(400, { email, error: error.message })
    }

    return { email, success: true }
  },
}
