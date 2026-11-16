import { command } from '$app/server'
import { signedInRedirectTarget } from '$lib/auth'
import { completeProfile as complete } from './profile.server'
import { profileSchema } from './schemas'

export const completeProfile = command(profileSchema, async ({ next, ...profile }) => {
  await complete(profile)
  return { redirectTo: signedInRedirectTarget(next) }
})
