/**
 * Alerts for the people who run the app: push every admin, mail whoever it did not reach.
 * `sendPushToUser` returns false for no device and for a refusal alike, so the fallback is one branch.
 */
import { sendEmail, type SendEmailInput } from '$lib/email/send.server'
import { contactLocale, type MessageOptions } from '$lib/i18n/message'
import { logServerFailure } from '$lib/logging/failure.server'
import { stringifyError } from '$lib/logging/stringify'
import type { Locale } from '$lib/paraglide/runtime'
import { appAdminRecipients, type AdminRecipient } from './adminRecipients.server'
import type { PushPayload } from './push'
import { sendPushToUser, subscriptionsFor } from './push.server'

export interface AdminAlertInput {
  /** The mail for an admin the push did not reach. `to` and `template` are the helper's: it names
   *  the failure log after {@link AdminAlertInput.label}, so a caller's own value never survives. */
  email: (recipient: AdminAlertRecipient) => Omit<SendEmailInput, 'template' | 'to'>
  /** Tags the swallowed failure in the log, e.g. `signup`. */
  label: string
  push: (recipient: AdminAlertRecipient) => PushPayload
}

/** One recipient, with the language to write to them in. */
export interface AdminAlertRecipient {
  admin: AdminRecipient
  /** Paraglide's second argument, ready to hand to a message. */
  at: MessageOptions
  locale: Locale
}

/** Never throws: whatever caused the alert is already done, so it must not fail on an unreachable host. */
export async function alertAppAdmins({ email, label, push }: AdminAlertInput): Promise<void> {
  try {
    const admins = await appAdminRecipients()

    if (admins.length === 0) {
      return
    }

    const subscriptions = await subscriptionsFor(admins.map((admin) => admin.userFk))

    await Promise.all(
      admins.map(async (admin) => {
        const locale = contactLocale(admin.locale)
        const recipient = { admin, at: { locale }, locale }

        const pushed = await sendPushToUser(subscriptions, admin.userFk, push(recipient))

        if (pushed || admin.email == null) {
          return
        }

        await sendEmail({ ...email(recipient), template: `admin-alert-${label}`, to: admin.email })
      }),
    )
  } catch (exception) {
    console.error(`[${label}] admin alert failed`, exception)
    await logServerFailure('adminAlert', `${label} failed: ${stringifyError(exception)}`)
  }
}
