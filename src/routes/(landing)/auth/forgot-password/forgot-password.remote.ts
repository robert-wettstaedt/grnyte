import { form, getRequestEvent } from '$app/server'
import { db } from '$lib/db/db.server'
import { authError, formError, honeypotSchema, isHoneypotFilled } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { invalid } from '@sveltejs/kit'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { authUsers } from 'drizzle-orm/supabase'

const forgotPasswordSchema = z.object({
  email: z.email({ error: formError('form_required') }),
  website: honeypotSchema,
})

/** GoTrue stores addresses lowercased, so a mixed-case entry must still find its account. */
async function isConfirmed(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(and(eq(authUsers.email, sql`lower(${email})`), isNotNull(authUsers.emailConfirmedAt)))
    .limit(1)
  return row != null
}

// Every branch answers alike, so the form cannot tell anyone whether an address has an account.
// An unconfirmed address never gets a reset: that second email is what subscription bombing wants.
export const forgotPassword = form(forgotPasswordSchema, async ({ email, website }) => {
  if (isHoneypotFilled(website) || !(await isConfirmed(email))) {
    return { email, success: true }
  }

  const {
    locals: { supabase },
    url,
  } = getRequestEvent()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${url.origin}/auth/reset-password`,
  })

  if (error != null) {
    invalid(authError(error))
  }

  return { email, success: true }
})
