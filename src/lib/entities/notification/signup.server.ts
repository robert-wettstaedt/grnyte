/**
 * A new account exists, and whoever runs the app is told. Deliberately not a `notifications` row:
 * every inbox row carries a `region_fk` whose SELECT policy needs `region.read`, and a fresh account
 * has no region. No row also means no cron and so no debounce, fine for a single event.
 *
 * Push first, mail to whoever it did not reach (`sendPushToUser` returns false for no device, no
 * VAPID keys and every device refused alike).
 */
import { sendEmail } from '$lib/email/send.server'
import { contactLocale } from '$lib/i18n/message'
import { m } from '$lib/paraglide/messages'
import { appAdminRecipients } from './adminRecipients.server'
import { sendPushToUser, subscriptionsFor } from './push.server'

export interface SignupAlertInput {
  /** Absolute origin, so the mail loads its logo from the environment that sent it. */
  origin: string
  /** `public.users.id` of the new account. */
  userFk: number
  username: string
}

/** Never throws: an account must not fail to be created because a push service or mail host was down. */
export async function notifyAdminsOfSignup({ origin, userFk, username }: SignupAlertInput): Promise<void> {
  try {
    const admins = await appAdminRecipients()

    if (admins.length === 0) {
      return
    }

    const subscriptions = await subscriptionsFor(admins.map((admin) => admin.userFk))

    await Promise.all(
      admins.map(async (admin) => {
        const locale = contactLocale(admin.locale)
        const at = { locale }
        const title = m.push_signupTitle({ username }, at)

        // Tag per account, so two signups in a row do not replace one another.
        const pushed = await sendPushToUser(subscriptions, admin.userFk, { tag: `signup:${userFk}`, title })

        if (pushed || admin.email == null) {
          return
        }

        await sendEmail({
          body: [m.email_signupAlertBody({ username }, at)],
          footerReason: 'account',
          // Stable, so a double-submitted or retried sign-up mails each admin once.
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
