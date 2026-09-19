import { db as baseDb } from '$lib/db/db.server'
import { userRoles, users, userSettings } from '$lib/db/schema'
import { eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'

/** `auth.users` is named `users` too: without the alias the join fails at runtime with 42P09. */
const authUser = alias(authUsers, 'auth_user')

export interface AdminRecipient {
  /** null where the auth row carries no address; that branch is push-only. */
  email: null | string
  /** null where the admin has no settings row, resolved to the default locale. */
  locale: null | string
  /** `public.users.id`, not the auth id. */
  userFk: number
}

/**
 * Every `app_admin`, with the address to mail and the language to write in.
 *
 * Base handle because neither `auth.users` nor `user_settings` is readable by `authenticated`.
 */
export async function appAdminRecipients(): Promise<AdminRecipient[]> {
  return (
    baseDb
      .select({ email: authUser.email, locale: userSettings.contactLocale, userFk: users.id })
      .from(userRoles)
      .innerJoin(users, eq(users.authUserFk, userRoles.authUserFk))
      .innerJoin(authUser, eq(authUser.id, userRoles.authUserFk))
      // LEFT: an admin with no settings row still gets told, in the default language.
      .leftJoin(userSettings, eq(userSettings.userFk, users.id))
      .where(eq(userRoles.role, 'app_admin'))
  )
}
