/**
 * Assert that a deployed environment is configured to let people sign up and receive mail.
 *
 * The half of the invite/signup flow that `npm test` and `npm run test:e2e` cannot see: those run
 * against a disposable database, so they prove the logic and nothing about the environment. A
 * flipped GoTrue toggle or an unverified Resend domain breaks sign-up in production while every
 * test stays green, which is exactly how it goes unnoticed.
 *
 * Reads only, writes nothing, sends nothing. Reuses the normal env var names, so pointing it at
 * production is a matter of which values are in the environment:
 *
 *   PUBLIC_SUPABASE_URL=https://<ref>.supabase.co PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
 *   SUPABASE_JWT_JWKS_URL=https://<ref>.supabase.co/auth/v1/.well-known/jwks.json \
 *   RESEND_API_KEY=... RESEND_SENDER_EMAIL='grnyte <no-reply@grnyte.rocks>' npm run check:prod
 *
 * ponytail: no check that migrations are applied. That needs the production DATABASE_URL and a
 * postgres connection, and drift there fails loudly on first use rather than silently. Add it if a
 * migration ever ships late.
 */
import 'dotenv/config'

const failures: string[] = []

function check(ok: boolean, message: string) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`)
  if (!ok) failures.push(message)
}

const supabaseUrl = required('PUBLIC_SUPABASE_URL')
const publishableKey = required('PUBLIC_SUPABASE_PUBLISHABLE_KEY')
const jwksUrl = required('SUPABASE_JWT_JWKS_URL')

console.log(`checking ${supabaseUrl}\n`)

// A legacy anon key (a JWT) is expected here until the new keys are created, so it warns instead of failing.
if (publishableKey.startsWith('sb_publishable_')) {
  check(true, 'PUBLIC_SUPABASE_PUBLISHABLE_KEY is a publishable key')
} else if (/^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(publishableKey)) {
  console.log('warn  PUBLIC_SUPABASE_PUBLISHABLE_KEY still holds the legacy anon key')
} else {
  check(false, 'PUBLIC_SUPABASE_PUBLISHABLE_KEY is a publishable key or the legacy anon key')
}

if (supabaseUrl.startsWith('https://')) {
  check(jwksUrl.startsWith('https://'), 'SUPABASE_JWT_JWKS_URL is https')
}
const jwks = await fetch(jwksUrl)
  .then((r) => r.json())
  .catch(() => ({}))
const keys: { alg?: string; kty?: string }[] = Array.isArray(jwks.keys) ? jwks.keys : []
check(
  keys.some((k) => k.alg === 'ES256' || k.alg === 'RS256' || k.kty === 'EC' || k.kty === 'RSA'),
  'the JWKS holds an asymmetric signing key (ES256 or RS256)',
)

// The public GoTrue settings endpoint. Everything sign-up depends on that is a switch rather than
// code lives here, and it is readable with the publishable key alone.
const auth = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: publishableKey } }).then((r) =>
  r.json(),
)

// Public sign-up stays off: accounts are created through the admin API, after the bot checks, so the
// published anon key cannot skip them.
check(auth.disable_signup === true, 'public signup is disabled (disable_signup is true)')
check(auth.external?.email === true, 'email provider is enabled')
// Confirmation is what the /auth/confirm handler and the signup mail exist for. If this flips true,
// accounts are created confirmed and that whole leg is silently dead.
check(auth.mailer_autoconfirm === false, 'email confirmation is required (mailer_autoconfirm is false)')

// Resend, via the cheapest authenticated GET there is. A bad key is indistinguishable from "no mail
// is sent" from the app's side, because sendEmail deliberately never throws: it logs and returns
// false, and the caller shows a soft failure.
const senderDomain = required('RESEND_SENDER_EMAIL').split('@').pop()?.replace('>', '').trim()
const response = await fetch('https://api.resend.com/domains', {
  headers: { authorization: `Bearer ${required('RESEND_API_KEY')}` },
})
const body = await response.json()

// A send-only key is the correct posture for this app and cannot list domains, so its 401 proves
// the key is real rather than that it is broken. Only an unrecognised key looks like this too, and
// it says so with a different `name`.
const restricted = body?.name === 'restricted_api_key'
check(response.ok || restricted, 'RESEND_API_KEY is accepted by the Resend API')

// Only a full-access key can see this. Not worth downgrading the key for: an unverified sender
// domain makes every send fail, which the invite spec's "invitation sent" toast already catches.
if (restricted) {
  console.log(`skip  sender domain ${senderDomain} verification (send-only key cannot list domains)`)
} else if (response.ok) {
  check(
    body.data?.some((d: { name: string; status: string }) => d.name === senderDomain && d.status === 'verified') ===
      true,
    `sender domain ${senderDomain} is verified with Resend`,
  )
}

// Web Push. Never documented in 1.0, which is how it ended up deployed with no keys at all: a
// missing pair is indistinguishable from "nothing to send" from the app's side, because the cron
// reports `configured: false` and returns 200 rather than failing.
const publicVapid = process.env.PUBLIC_VAPID_KEY ?? ''
const privateVapid = process.env.PRIVATE_VAPID_KEY ?? ''

check(publicVapid.length > 0 && privateVapid.length > 0, 'VAPID key pair is set')

if (publicVapid.length > 0 && privateVapid.length > 0) {
  // The lengths are fixed by the curve (P-256): 65 raw bytes public, 32 private, url-safe base64.
  // A truncated or swapped pair passes a presence check and then fails every single send.
  const decoded = (value: string) => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').length
  check(decoded(publicVapid) === 65, 'PUBLIC_VAPID_KEY decodes to a 65-byte P-256 public key')
  check(decoded(privateVapid) === 32, 'PRIVATE_VAPID_KEY decodes to a 32-byte P-256 private key')
}

console.log(failures.length === 0 ? '\nall good' : `\n${failures.length} check(s) failed`)
process.exit(failures.length === 0 ? 0 : 1)

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`check-prod-config: ${name} is required`)
    process.exit(2)
  }
  return value
}
