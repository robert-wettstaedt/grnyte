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
 *   PUBLIC_SUPABASE_URL=https://<ref>.supabase.co PUBLIC_SUPABASE_ANON_KEY=... \
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
const anonKey = required('PUBLIC_SUPABASE_ANON_KEY')

console.log(`checking ${supabaseUrl}\n`)

// The public GoTrue settings endpoint. Everything sign-up depends on that is a switch rather than
// code lives here, and it is readable with the anon key alone.
const auth = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: anonKey } }).then((r) => r.json())

check(auth.disable_signup === false, 'signup is enabled (disable_signup is false)')
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
