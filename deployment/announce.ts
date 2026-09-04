import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import { authUsers } from 'drizzle-orm/supabase'
import Database from 'postgres'
import { Resend } from 'resend'
import drizzleConfig from '../drizzle.config'
import * as schema from '../src/lib/db/schema'
import { users, userSettings } from '../src/lib/db/schema'
import { BRAND } from '../src/lib/email/brand.cli'
import { renderEmailHtml, renderEmailText, type EmailContent, type EmailLocale } from '../src/lib/email/shell'

/**
 * One-off sender for the two v2 migration mails. Delete this file once both have gone out.
 *
 *   npx tsx deployment/announce.ts downtime --date 2026-09-13 --dry-run
 *   npx tsx deployment/announce.ts downtime --date 2026-09-13 --send
 *   npx tsx deployment/announce.ts release --dry-run
 *   npx tsx deployment/announce.ts release --send
 *
 * A script and not a route: nothing that mails every account holder should outlive the send, and
 * the copy lives here for the same reason. Resend is called directly because
 * `$lib/email/send.server` reads `$env/static/private` and is unreachable from tsx; the shell is
 * imported so these look like every other mail the app sends.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const RESEND_SENDER_EMAIL = process.env.RESEND_SENDER_EMAIL ?? ''
// Shared with the shell, so the button, the logo and the footer wordmark cannot disagree.
const ORIGIN = BRAND.origin

/** Resend's free tier allows 2 requests a second. Half that. */
const GAP_MS = 1000

// `auth.users` and `public.users` are both "users" to drizzle: unaliased, the join typechecks and
// fails only at runtime, with 42P09 "table reference is ambiguous".
const authUser = alias(authUsers, 'auth_user')

type Kind = 'downtime' | 'release'

interface Recipient {
  email: string
  locale: EmailLocale
  username: string
}

const isLocale = (value: null | string): value is EmailLocale => value === 'de' || value === 'en'

/**
 * Localised copy for both mails.
 *
 * Every sentence must answer "what do I need to know to keep using the account I already have";
 * anything else is Werbung under section 7 UWG. There is no consent on file, and 7(3)'s
 * existing-customer exception is unavailable because its notice requirement attaches when the
 * address is collected and cannot be met retroactively. So nothing here asks the reader to do
 * something for the sender, and the feedback line states where a screen is rather than inviting
 * its use.
 *
 * The release mail is also the change notice promised by clause 21 of the terms, so its terms
 * paragraph is not optional and says the published version governs.
 */
const COPY: Record<Kind, Record<EmailLocale, (date: string) => EmailContent>> = {
  downtime: {
    de: (date) => ({
      body: [
        `Ich stelle grnyte am ${date} auf eine neu gebaute Version um. Währenddessen ist die App offline, voraussichtlich den größten Teil des Tages.`,
        'Nichts von dem, was du eingetragen hast, geht verloren. Deine Gebiete, Topos und Begehungen sind danach alle da.',
        'Wenn die App am nächsten Morgen noch offline ist, ist etwas schiefgegangen und ich kümmere mich darum.',
      ],
      footerReason: 'account',
      meta: 'WARTUNG',
      preheader: 'Geplante Wartung, während ich die App auf die neue Version umstelle.',
      subject: `grnyte ist am ${date} offline`,
      title: `grnyte ist am ${date} offline`,
    }),
    en: (date) => ({
      body: [
        `I'm moving grnyte to a rewritten version on ${date}, and the app is offline while I do it. I expect it to take most of the day.`,
        "Nothing you've logged goes away. Your areas, topos and ascents are all there when it comes back.",
        "If it's still down the next morning, something has gone wrong and I'm on it.",
      ],
      footerReason: 'account',
      meta: 'MAINTENANCE',
      preheader: 'Planned downtime while I move the app to the new version.',
      subject: `grnyte is offline on ${date}`,
      title: `grnyte is offline on ${date}`,
    }),
  },
  release: {
    de: () => ({
      action: { label: 'grnyte öffnen', url: ORIGIN },
      body: [
        'grnyte ist zurück, und es ist eine Neuentwicklung und kein Update. Die Karte, der Topo-Editor und dein Logbuch funktionieren jetzt anders.',
        'Deine Regionen, Gebiete, Topos und Begehungen sind unverändert übernommen. Nichts aus der alten Version fehlt.',
        'Mit dieser Version haben sich die Nutzungsbedingungen und die Datenschutzerklärung geändert. Die Klauseln 9 bis 14 sind neu und regeln das Melden rechtswidriger Inhalte, und die Datenschutzerklärung beschreibt jetzt auch Feedback. Es gelten die Fassungen auf der Website.',
        'In den Einstellungen kannst du mir jetzt Feedback schicken, auch wenn etwas in der alten Version funktioniert hat und jetzt nicht mehr.',
      ],
      footerReason: 'account',
      meta: 'NEUE VERSION',
      preheader: 'Die neu gebaute Version ist online, und die Nutzungsbedingungen haben sich geändert.',
      subject: 'Das neue grnyte ist online',
      title: 'Das neue grnyte ist online',
    }),
    en: () => ({
      action: { label: 'Open grnyte', url: ORIGIN },
      body: [
        "grnyte is back, and it's a rewrite rather than an update. The map, the topo editor and your logbook all work differently now.",
        'Your regions, areas, topos and ascents came across unchanged. Nothing you logged in the old version is gone.',
        'The terms and the privacy policy changed with this release. Clauses 9 to 14 are new and cover reporting unlawful content, and the privacy policy now describes feedback. The versions on the site are the ones that apply.',
        "Settings has a way to send me feedback now, including when something worked in the old version and doesn't in this one.",
      ],
      footerReason: 'account',
      meta: 'NEW VERSION',
      preheader: 'The rewritten version is live, and the terms changed with it.',
      subject: 'The new grnyte is live',
      title: 'The new grnyte is live',
    }),
  },
}

const args = process.argv.slice(2)
const kind = args[0] as Kind
const send = args.includes('--send')
const date = args[args.indexOf('--date') + 1]

if (kind !== 'downtime' && kind !== 'release') {
  throw new Error('usage: announce.ts <downtime|release> [--date YYYY-MM-DD] [--send]')
}
if (kind === 'downtime' && (!args.includes('--date') || date == null || date.startsWith('--'))) {
  throw new Error('the downtime mail needs --date, which is printed verbatim in the subject and body')
}
if (send && (RESEND_API_KEY === '' || RESEND_SENDER_EMAIL === '')) {
  throw new Error('RESEND_API_KEY and RESEND_SENDER_EMAIL must be set to --send')
}

const postgres = Database(drizzleConfig.dbCredentials.url, { prepare: false })
const db = drizzle(postgres, { schema })

// `contactLocale` is the language chosen for mail, not the ambient or browser one. LEFT join so an
// account with no settings row still gets the mail, in English.
const rows = await db
  .select({ email: authUser.email, locale: userSettings.contactLocale, username: users.username })
  .from(users)
  .innerJoin(authUser, eq(authUser.id, users.authUserFk))
  .leftJoin(userSettings, eq(userSettings.userFk, users.id))

const recipients: Recipient[] = rows
  .filter((row): row is typeof row & { email: string } => row.email != null && row.email.length > 0)
  .map((row) => ({ email: row.email, locale: isLocale(row.locale) ? row.locale : 'en', username: row.username }))

const byLocale = recipients.reduce<Record<string, number>>(
  (acc, r) => ({ ...acc, [r.locale]: (acc[r.locale] ?? 0) + 1 }),
  {},
)
console.log(`${kind}: ${recipients.length} recipients`, byLocale, send ? '(SENDING)' : '(dry run)')

if (!send) {
  const sample = COPY[kind].en(date ?? 'DATE')
  console.log(`\nsubject: ${sample.subject}\n`)
  console.log(renderEmailText({ ...sample, brand: BRAND, locale: 'en', origin: ORIGIN }))
  console.log('\nre-run with --send to deliver')
  await postgres.end()
  process.exit(0)
}

const resend = new Resend(RESEND_API_KEY)
let sent = 0
let failed = 0

for (const recipient of recipients) {
  const content = COPY[kind][recipient.locale](date ?? '')
  const input = { ...content, brand: BRAND, locale: recipient.locale, origin: ORIGIN }

  // Keyed on mail plus recipient, so a re-run after a partial failure only re-sends what did not
  // go out. Stable, because there is no second version of either mail.
  const { error } = await resend.emails.send(
    {
      from: RESEND_SENDER_EMAIL,
      html: renderEmailHtml(input),
      subject: content.subject,
      text: renderEmailText(input),
      to: recipient.email,
    },
    { idempotencyKey: `announce-${kind}-${recipient.email}` },
  )

  if (error == null) {
    sent += 1
  } else {
    failed += 1
    console.error(`FAILED ${recipient.email}`, error.message)
  }

  await new Promise((resolve) => setTimeout(resolve, GAP_MS))
}

console.log(`sent ${sent}, failed ${failed}`)
await postgres.end()
