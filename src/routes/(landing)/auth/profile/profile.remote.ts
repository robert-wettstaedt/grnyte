import { command } from '$app/server'
import { nextDestination } from '$lib/auth'
import { completeProfile as complete } from './profile.server'
import { profileSchema } from './schemas'

// Followed in the page, an in-page move no installed app catches: no /auth/continue hop.
export const completeProfile = command(profileSchema, async ({ next, ...profile }) => {
  await complete(profile)
  return { redirectTo: nextDestination(next) }
})
