import { RESEND_API_KEY, RESEND_SENDER_EMAIL } from '$env/static/private'
import { PUBLIC_ORIGIN, PUBLIC_TOPO_EMAIL } from '$env/static/public'
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
  to: string | string[]
}

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
export async function sendEmail({ idempotencyKey, to, ...content }: SendEmailInput): Promise<boolean> {
  // `new Resend('')` throws synchronously, which inside this async function becomes a rejected
  // promise and fails the caller's mutation, exactly what the contract above rules out.
  // `.env.example` ships `RESEND_API_KEY=` empty, so this is the default-config path.
  if (!RESEND_API_KEY) {
    console.error('[email] RESEND_API_KEY is not set, dropping', content.subject)
    return false
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
    return true
  }

  // `error` is an unvalidated JSON.parse of the response body, so nothing here can assume
  // a shape. Log and move on.
  console.error('[email] send failed', { message: error.message, name: error.name, subject: content.subject })
  return false
}
