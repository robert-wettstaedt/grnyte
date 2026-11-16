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
 *   RESEND_API_KEY=... RESEND_SENDER_EMAIL='grnyte <no-reply@grnyte.rocks>' \
 *   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=<read-only token> npm run check:prod
 *
 * ponytail: no check that migrations are applied. That needs the production DATABASE_URL and a
 * postgres connection, and drift there fails loudly on first use rather than silently. Add it if a
 * migration ever ships late.
 */
import 'dotenv/config'
import { assertAuthConfig, assertGotrueVersion, GOTRUE_CONTRACT_VERSION } from './authConfig'

const failures: string[] = []

function check(ok: boolean, message: string) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`)
  if (!ok) failures.push(message)
}

const supabaseUrl = required('PUBLIC_SUPABASE_URL')
const publishableKey = required('PUBLIC_SUPABASE_PUBLISHABLE_KEY')
const jwksUrl = required('SUPABASE_JWT_JWKS_URL')

console.log(`checking ${supabaseUrl}\n`)

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
const keys: { alg?: string; crv?: string; kty?: string }[] = Array.isArray(jwks.keys) ? jwks.keys : []
// The verifier accepts only these two; a key with no `alg` counts by its type and curve.
const VERIFIER_ALGS = new Set(['ES256', 'RS256'])
const impliedAlg = (k: (typeof keys)[number]) =>
  k.kty === 'RSA' ? 'RS256' : k.kty === 'EC' && k.crv === 'P-256' ? 'ES256' : undefined
check(
  keys.some((k) => VERIFIER_ALGS.has(k.alg ?? impliedAlg(k) ?? '')),
  'the JWKS holds an asymmetric signing key (ES256 or RS256)',
)

// GoTrue's switches: the public settings endpoint (publishable key) and the Management API, which
// alone shows the hook, the code length and the rest. Without its token that half fails, never skips.
const auth = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: publishableKey } }).then((r) =>
  r.json(),
)
const projectRef = process.env.SUPABASE_PROJECT_REF ?? ''
const accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? ''
check(projectRef !== '' && accessToken !== '', 'SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN are set')
const authConfig =
  projectRef === '' || accessToken === ''
    ? {}
    : await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
        headers: { authorization: `Bearer ${accessToken}` },
      })
        .then((r) => r.json())
        .catch(() => ({}))
const authFailures = assertAuthConfig(auth, authConfig, {
  appleServicesId: process.env.APPLE_SERVICES_ID ?? '',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
})
for (const failure of authFailures) check(false, failure)
if (authFailures.length === 0) check(true, 'GoTrue auth config (hook, codes, sessions, notices, limits, providers)')

// The deployed sign-in screen offers both providers: `configuredProviders` drops one whose env is incomplete.
const signInHtml = await fetch(`${required('PUBLIC_ORIGIN')}/auth/signin?form=signin`, {
  headers: { 'accept-language': 'en' },
})
  .then((r) => r.text())
  .catch(() => '')
for (const label of ['Continue with Apple', 'Continue with Google']) {
  check(signInHtml.includes(label), `the deployed /auth/signin offers "${label}"`)
}

// Hosted GoTrue upgrades without notice; the behaviours grnyte relies on were tested on one release.
const health = await fetch(`${supabaseUrl}/auth/v1/health`, { headers: { apikey: publishableKey } })
  .then((r) => r.json())
  .catch(() => ({}))
const versionFailure = assertGotrueVersion(health)
check(versionFailure == null, versionFailure ?? `GoTrue is the tested ${GOTRUE_CONTRACT_VERSION}`)

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
