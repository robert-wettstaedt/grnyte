/**
 * A new account exists, and whoever runs the app is told. Deliberately not a `notifications` row:
 * every inbox row carries a `region_fk` whose SELECT policy needs `region.read`, and a fresh account
 * has no region. No row also means no cron and so no debounce, fine for a single event.
 */
import { m } from '$lib/paraglide/messages'
import { alertAppAdmins } from './adminAlert.server'

export interface SignupAlertInput {
  /** Absolute origin, so the mail loads its logo from the environment that sent it. */
  origin: string
  /** `public.users.id` of the new account. */
  userFk: number
  username: string
}

/** Never throws: an account must not fail to be created because a push service or mail host was down. */
export async function notifyAdminsOfSignup({ origin, userFk, username }: SignupAlertInput): Promise<void> {
  await alertAppAdmins({
    email: ({ admin, at, locale }) => {
      const title = m.push_signupTitle({ username }, at)

      return {
        body: [m.email_signupAlertBody({ username }, at)],
        footerReason: 'account',
        // Stable, so a double-submitted or retried sign-up mails each admin once.
        idempotencyKey: `signup-${userFk}-${admin.userFk}`,
        locale,
        meta: m.email_signupAlertMeta({}, at),
        origin,
        preheader: m.email_signupAlertPreheader({}, at),
        subject: title,
        template: 'signup-alert',
        title,
      }
    },
    label: 'signup',
    // Tag per account, so two signups in a row do not replace one another.
    push: ({ at }) => ({ tag: `signup:${userFk}`, title: m.push_signupTitle({ username }, at) }),
  })
}
