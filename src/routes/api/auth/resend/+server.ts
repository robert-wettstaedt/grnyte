import { userNeedsEmailVerification } from '$lib/components/EmailVerification/lib'
import { db } from '$lib/db/db.server'
import { eq } from 'drizzle-orm'
import { authUsers } from 'drizzle-orm/supabase'

export const GET = async ({ locals, url }) => {
  if (userNeedsEmailVerification(locals.session, locals.userPermissions)) {
    await db.update(authUsers).set({ emailConfirmedAt: null }).where(eq(authUsers.id, locals.session.user.id))

    const { data, error } = await locals.supabase.auth.resend({
      email: locals.session.user.email,
      type: 'signup',
      options: { emailRedirectTo: `${url.origin}/auth/confirm` },
    })

    if (data != null) {
      return new Response(undefined, { status: 200 })
    }

    return new Response(error?.message ?? 'Unknown error', { status: 400 })
  }

  return new Response('User does not meet the requirements', { status: 400 })
}
