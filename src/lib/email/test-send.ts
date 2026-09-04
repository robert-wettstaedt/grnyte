import 'dotenv/config'
import { Resend } from 'resend'
import { BRAND } from './brand.cli'
import { renderEmailHtml, renderEmailText, type EmailContent, type EmailLocale } from './shell'
import { GOTRUE_TEMPLATES } from './templates'

/**
 * Sends every template to real inboxes so they can be checked in real clients.
 *
 *   npx tsx src/lib/email/test-send.ts you@gmail.com you@outlook.com
 *   npx tsx src/lib/email/test-send.ts --locale=de you@gmail.com
 *
 * A browser is not an email client. Outlook on Windows renders with the Word engine and Gmail
 * on iOS force-inverts colours, and neither can be reproduced locally. The clients worth
 * covering, roughly in order of how much they diverge: classic Outlook on Windows, Gmail iOS
 * (dark mode on), Outlook.com in a browser (dark mode on), Gmail web, Apple Mail.
 *
 * Subjects are prefixed with the template key so 13 near-identical security notices can be told
 * apart in an inbox. Everything else is exactly what GoTrue would send, except that the Go
 * expressions are filled in below, since nothing is here to expand them.
 *
 * Reads RESEND_API_KEY and RESEND_SENDER_EMAIL from .env directly: this runs under tsx, outside
 * Vite, so `$env/static/private` (and therefore send.server.ts) is not resolvable here.
 *
 * `dotenv/config` as an import, not a `loadEnvFile` call in the body: `brand.cli.ts` reads the
 * environment as it is imported, so a call down here would run too late.
 */

const API_KEY = process.env.RESEND_API_KEY
const SENDER = process.env.RESEND_SENDER_EMAIL

// Stand-ins for the variables GoTrue would expand. The token hash is deliberately full length:
// a real one is what makes the fallback URL wrap, and that wrap is one of the things to look at.
const SAMPLE: Record<string, string> = {
  '{{ .FactorType }}': 'an authenticator app',
  '{{ .NewEmail }}': 'new.address@example.com',
  '{{ .OldEmail }}': 'old.address@example.com',
  '{{ .OldPhone }}': '+49 151 0000000',
  '{{ .Phone }}': '+49 151 1111111',
  '{{ .Provider }}': 'Google',
  '{{ .SiteURL }}': BRAND.origin,
  '{{ .TokenHash }}': 'pkce_a4f1c9e02b7d48a1b6e3f05c9d2a71e8c7b4906df31e5a8c2049fbd6e7c1a83',
  '{{ .Token }}': '481902',
}

const fill = (value: string) =>
  Object.entries(SAMPLE).reduce((acc, [token, sample]) => acc.split(token).join(sample), value)

const fillContent = (content: EmailContent): EmailContent => ({
  ...content,
  action: content.action && { label: fill(content.action.label), url: fill(content.action.url) },
  body: content.body.map(fill),
  code: content.code == null ? undefined : fill(content.code),
  footnote: content.footnote == null ? undefined : fill(content.footnote),
  meta: fill(content.meta),
  preheader: fill(content.preheader),
  subject: fill(content.subject),
  title: fill(content.title),
})

const args = process.argv.slice(2)
const locale = (args.find((a) => a.startsWith('--locale='))?.split('=')[1] ?? 'en') as EmailLocale
const recipients = args.filter((a) => !a.startsWith('--'))

if (recipients.length === 0) {
  console.error('Usage: npx tsx src/lib/email/test-send.ts [--locale=de] <address> [address...]')
  process.exit(1)
}

if (API_KEY == null || API_KEY === '' || SENDER == null || SENDER === '') {
  console.error('RESEND_API_KEY and RESEND_SENDER_EMAIL must be set in .env')
  process.exit(1)
}

// Once Resend suppresses an address (any hard bounce does it), later sends to it are accepted by
// the API and quietly dropped. So "the script said sent, nothing arrived" means check the
// suppression list before suspecting the markup.

const messages = recipients.flatMap((to) =>
  Object.entries(GOTRUE_TEMPLATES).map(([key, template]) => {
    const content = fillContent(template)
    return {
      from: SENDER,
      html: renderEmailHtml({ ...content, brand: BRAND, locale }),
      subject: `[${key}] ${content.subject}`,
      text: renderEmailText({ ...content, brand: BRAND, locale }),
      to,
    }
  }),
)

console.log(
  `sending ${messages.length} emails (${Object.keys(GOTRUE_TEMPLATES).length} templates x ${recipients.length} recipients, locale ${locale})`,
)

// One batch call rather than a loop, so the free tier's 2-requests-per-second limit is not a
// factor. `permissive` reports the individual failures instead of rejecting the whole batch.
const { data, error } = await new Resend(API_KEY).batch.send(messages, { batchValidation: 'permissive' })

if (error != null) {
  console.error('batch failed', error)
  process.exit(1)
}

console.log(`sent ${data?.data.length ?? 0}`)

for (const failure of data?.errors ?? []) {
  console.error(`  failed: ${messages[failure.index]?.subject} -> ${failure.message}`)
}

console.log(`
Now check, in this order (most divergent first):
  1. classic Outlook on Windows: button padding, font (must not be Times New Roman), centring
  2. Gmail iOS with dark mode on: forced inversion, is the violet button still legible
  3. Outlook.com in a browser, dark mode on
  4. Gmail web, then Apple Mail
Also: does the logo load at all (it comes from ${SAMPLE['{{ .SiteURL }}']}/pwa-192x192.png), and
does it still look right with images blocked.`)
