import { error, redirect } from '@sveltejs/kit'

export const load = async ({ locals }) => {
  if (locals.user == null) {
    error(404)
  }

  redirect(301, `/users/${locals.user.username}`)
}
