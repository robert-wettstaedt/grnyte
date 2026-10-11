import { RESEND_API_KEY, RESEND_SENDER_EMAIL } from '$env/static/private'
import { PUBLIC_ORIGIN, PUBLIC_TOPO_EMAIL } from '$env/static/public'
import { logServerFailure } from '$lib/logging/failure.server'
import { Resend } from 'resend'
import { makeBrand } from './brand'
import { renderEmailHtml, renderEmailText, type EmailInput } from './shell'

/** The app's half of the seam in `brand.ts`. */
const BRAND = makeBrand({ contactEmail: PUBLIC_TOPO_EMAIL, origin: PUBLIC_ORIGIN })

// Constructed lazily: `new Resend()` throws when the key is missing, and at module scope
// that would take down every import of this file in an environment without mail configured.
let client: Resend | undefined
const resend = () => (client ??= new Resend(RESEND_API_KEY))

// `brand` omitted: a property of the deployment, not of the mail, so this file supplies it.
export interface SendEmailInput extends Omit<EmailInput, 'brand'> {
  /**
   * Dedupes retries and double-submits. Derive it from what caused the mail, never a bare
   * timestamp. Stable when the cause happens once (`invitation-<id>`); composite when one cause
   * fans out to several recipients (`signup-<user>-<admin>`), or every admin after the first
   * silently gets nothing; varying when a second send is deliberate (`invitation-<id>-<ts>`),
   * from a stored timestamp so a retry of that send still dedupes. An over-varying key sends a
   * visible duplicate, an over-stable one drops mail and reports success.
   */
  idempotencyKey?: string
  /**
   * Which mail this is, for the failure log. Never the rendered subject: those carry a username,
   * an inviter or a region name, and an error log is not where those belong.
   */
  template: string
  to: string | string[]
}

/** Whether the missing-key state has been recorded this process. */
let notedUnconfigured = false

/** Resend failures a later attempt can get past; the SDK reports a network failure as `application_error`. */
const TRANSIENT = new Set([
  'application_error',
  'concurrent_idempotent_requests',
  'daily_quota_exceeded',
  'internal_server_error',
  'rate_limit_exceeded',
])

/** {@link sendEmailOutcome}'s answer: `retry` only when sending again could succeed. */
export type SendOutcome = 'failed' | 'retry' | 'sent'

/**
 * Sends one email, HTML plus plaintext, through Resend.
 *
 * Never throws and never rejects: a mutation must not fail because the mail host was down,
 * so this returns whether it went out and leaves the decision to the caller. Note the SDK
 * itself does not throw on API errors either, it returns `{ data, error }`, and it swallows
 * network failures into `error.name === 'application_error'`.
 *
 * ponytail: no retry queue. Delivery is best effort. Add one when a dropped mail costs
 * something (an invite nobody can re-send), not before.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  return (await sendEmailOutcome(input)) === 'sent'
}

/**
 * {@link sendEmail}, telling a failure worth retrying from one that will fail again. `quietRetry`
 * leaves a `retry` unlogged, for a caller that retries on a schedule and logs when it gives up.
 */
export async function sendEmailOutcome(
  { idempotencyKey, template, to, ...content }: SendEmailInput,
  { quietRetry = false } = {},
): Promise<SendOutcome> {
  // `new Resend('')` throws synchronously, which inside this async function becomes a rejected
  // promise and fails the caller's mutation, exactly what the contract above rules out.
  // `.env.example` ships `RESEND_API_KEY=` empty, so this is the default-config path.
  if (!RESEND_API_KEY) {
    console.error('[email] RESEND_API_KEY is not set, dropping', content.subject)
    // Once per process: unset, it drops every mail, and a row each would be the whole table.
    if (!notedUnconfigured) {
      notedUnconfigured = true
      await logServerFailure('email', 'RESEND_API_KEY is not set, dropping every mail')
    }
    return 'failed'
  }

  const input = { ...content, brand: BRAND }

  const { error } = await resend().emails.send(
    {
      from: RESEND_SENDER_EMAIL,
      html: renderEmailHtml(input),
      subject: content.subject,
      text: renderEmailText(input),
      to,
    },
    idempotencyKey == null ? undefined : { idempotencyKey },
  )

  if (error == null) {
    return 'sent'
  }

  // `error` is an unvalidated JSON.parse of the response body, so nothing here can assume
  // a shape. Log and move on.
  console.error('[email] send failed', { message: error.message, name: error.name, subject: content.subject })
  const outcome = TRANSIENT.has(error.name) ? 'retry' : 'failed'
  // Name and template only. Not the recipient, not the rendered subject, and not `error.message`:
  // that is an unvalidated parse of Resend's body, and its validation errors quote the address.
  if (!(quietRetry && outcome === 'retry')) {
    await logServerFailure('email', `send failed (${String(error.name)}) for ${template}`)
  }
  return outcome
}
