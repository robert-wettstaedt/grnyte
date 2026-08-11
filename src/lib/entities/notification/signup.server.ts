/**
 * The one alert that is not about a region: a new account exists, and whoever runs the app is told.
 *
 * Deliberately NOT a `notifications` row. Every inbox row carries a `region_fk` and its SELECT
 * policy requires `region.read` on it, while a fresh account belongs to no region at all, so there
 * is no region to file this under and nobody it could be shown to. It also skips the cron for the
 * same reason (the cron pushes rows, and there is no row), which means no debounce: a signup is a
 * single event, not a burst.
 *
 * Push first, mail to whoever it did not reach. `sendPushToUser` reports false for all three ways
 * that can happen (no device registered, no VAPID keys configured, every device refused), so the
 * fallback is one branch rather than three.
 */
import { db as baseDb } from '$lib/db/db.server'
import { userRoles, users, userSettings } from '$lib/db/schema'
import { sendEmail } from '$lib/email/send.server'
import { contactLocale } from '$lib/i18n/message'
import { m } from '$lib/paraglide/messages'
import { eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'
import { sendPushToUser, subscriptionsFor } from './push.server'

/** `auth.users` is named `users` too, so joining it beside `public.users` needs a name of its own. */
const authUser = alias(authUsers, 'auth_user')

export interface SignupAlertInput {
  /** Absolute origin, so the mail loads its logo from the environment it was sent by. */
  origin: string
  /** `public.users.id` of the account that was just created. Only the idempotency key uses it. */
  userFk: number
  username: string
}

/**
 * Tell every `app_admin` that `username` signed up.
 *
 * Never throws: this runs at the end of sign-up, and an account must not fail to be created
 * because a push service or a mail host was unreachable.
 */
export async function notifyAdminsOfSignup({ origin, userFk, username }: SignupAlertInput): Promise<void> {
  try {
    // `auth.users` for the address (that is where an email lives) and `user_settings` for the
    // language to write in. Both over the base handle: neither is readable by `authenticated`,
    // and the person this is about is not the person being told.
    const admins = await baseDb
      .select({ email: authUser.email, locale: userSettings.contactLocale, userFk: users.id })
      .from(userRoles)
      .innerJoin(users, eq(users.authUserFk, userRoles.authUserFk))
      .innerJoin(authUser, eq(authUser.id, userRoles.authUserFk))
      // LEFT: an admin with no settings row still gets told, in the default language.
      .leftJoin(userSettings, eq(userSettings.userFk, users.id))
      .where(eq(userRoles.role, 'app_admin'))

    if (admins.length === 0) {
      return
    }

    const subscriptions = await subscriptionsFor(admins.map((admin) => admin.userFk))

    await Promise.all(
      admins.map(async (admin) => {
        const locale = contactLocale(admin.locale)
        const at = { locale }
        const title = m.push_signupTitle({ username }, at)

        // Its own tag per account, so two signups in a row do not replace one another.
        const pushed = await sendPushToUser(subscriptions, admin.userFk, { tag: `signup:${userFk}`, title })

        if (pushed || admin.email == null) {
          return
        }

        await sendEmail({
          body: [m.email_signupAlertBody({ username }, at)],
          footerReason: 'account',
          // Stable, so a double-submitted sign-up that slipped past the disabled button (or a
          // retry) mails each admin once.
          idempotencyKey: `signup-${userFk}-${admin.userFk}`,
          locale,
          meta: m.email_signupAlertMeta({}, at),
          origin,
          preheader: m.email_signupAlertPreheader({}, at),
          subject: title,
          title,
          to: admin.email,
        })
      }),
    )
  } catch (exception) {
    console.error('[signup] admin alert failed', exception)
  }
}
