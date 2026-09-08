import 'dotenv/config'
import Database from 'postgres'
import { Resend } from 'resend'
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

const DATABASE_URL = process.env.DATABASE_URL ?? ''
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const RESEND_SENDER_EMAIL = process.env.RESEND_SENDER_EMAIL ?? ''
// Shared with the shell, so the button, the logo and the footer wordmark cannot disagree.
const ORIGIN = BRAND.origin

/** Resend's free tier allows 2 requests a second. Half that. */
const GAP_MS = 1000

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
const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : undefined

if (kind !== 'downtime' && kind !== 'release') {
  throw new Error('usage: announce.ts <downtime|release> [--date YYYY-MM-DD] [--since YYYY-MM-DD] [--send]')
}
if (since != null && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
  throw new Error('--since takes YYYY-MM-DD')
}
if (kind === 'downtime' && (!args.includes('--date') || date == null || date.startsWith('--'))) {
  throw new Error('the downtime mail needs --date, which is printed verbatim in the subject and body')
}
if (send && (RESEND_API_KEY === '' || RESEND_SENDER_EMAIL === '')) {
  throw new Error('RESEND_API_KEY and RESEND_SENDER_EMAIL must be set to --send')
}
// Unset, postgres.js falls back to localhost as the OS user rather than failing, which is how you
// mail dev accounts through the live Resend key.
if (DATABASE_URL === '') {
  throw new Error('DATABASE_URL must be set')
}

const postgres = Database(DATABASE_URL, { prepare: false })

// Raw SQL: the two mails straddle the migration, `$lib/db/schema` only describes the far side. One
// catalog for both facts, since `information_schema` hides columns the role merely cannot read.
const [shape] = await postgres<{ hasContactLocale: boolean; hasEvents: boolean; hasPushLang: boolean }[]>`
  SELECT
    to_regclass('public.events') IS NOT NULL AS "hasEvents",
    EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = to_regclass('public.user_settings') AND attname = 'contact_locale' AND NOT attisdropped
    ) AS "hasContactLocale",
    EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = to_regclass('public.push_subscriptions') AND attname = 'lang' AND NOT attisdropped
    ) AS "hasPushLang"
`

// Which database this actually is, printed below. A stale .env points at the dev stack.
const [server] = await postgres<{ host: null | string; name: string }[]>`
  SELECT current_database() AS name, host(inet_server_addr()) AS host
`

// One cutoff, resolved once and printed, so `--since` can pin the release mail to the window the
// downtime mail used. Left rolling, the two sends reach different people for no stated reason.
const [cutoff] = await postgres<{ since: Date }[]>`
  SELECT coalesce(${since ?? null}::timestamptz, now() - interval '6 months') AS since
`

// 0097 seeds `contact_locale` from `lang`, then drops it. Coalesced while both exist, but NOT
// equivalent: 0097 skips accounts with no settings row, so those are German before, English after.
const settingsLocale = postgres`(SELECT s.contact_locale FROM public.user_settings s WHERE s.user_fk = u.id)`
const pushLocale = postgres`(
  SELECT p.lang FROM public.push_subscriptions p
  WHERE p.user_fk = u.id AND p.lang IN ('en', 'de')
  ORDER BY p.id DESC LIMIT 1
)`
const locale =
  shape.hasContactLocale && shape.hasPushLang
    ? postgres`coalesce(${settingsLocale}, ${pushLocale})`
    : shape.hasContactLocale
      ? settingsLocale
      : pushLocale

// Where "this region is still climbed in" is written down. 0099 folds `activities` into `events`,
// but the fold drops activities whose object row is gone, so the two do not answer identically.
const activity = shape.hasEvents ? postgres`public.events` : postgres`public.activities`

// Qualified, or a search_path resolving `users` to `auth.users` reads a different table than the
// probe checked. Deleted and banned are out; the nested EXISTS dedupes a member of four regions.
const rows = await postgres<{ email: null | string; locale: null | string; username: string }[]>`
  SELECT au.email, ${locale} AS locale, u.username
  FROM public.users u
  JOIN auth.users au ON au.id = u.auth_user_fk
  WHERE au.deleted_at IS NULL
    AND (au.banned_until IS NULL OR au.banned_until < now())
    AND EXISTS (
      SELECT 1
      FROM public.region_members rm
      WHERE rm.user_fk = u.id
        AND rm.is_active
        AND EXISTS (
          SELECT 1
          FROM ${activity} a
          WHERE a.region_fk = rm.region_fk
            AND a.created_at >= ${cutoff.since}
        )
    )
`

const recipients: Recipient[] = rows
  .filter((row): row is typeof row & { email: string } => row.email != null && row.email.length > 0)
  .map((row) => ({ email: row.email, locale: isLocale(row.locale) ? row.locale : 'en', username: row.username }))

const byLocale = recipients.reduce<Record<string, number>>(
  (acc, r) => ({ ...acc, [r.locale]: (acc[r.locale] ?? 0) + 1 }),
  {},
)
console.log(
  `${kind}: ${recipients.length} recipients`,
  byLocale,
  `[${server.name}@${server.host ?? 'local'} · ${shape.hasEvents ? 'events' : 'activities'}` +
    ` since ${cutoff.since.toISOString().slice(0, 10)}` +
    ` · ${shape.hasContactLocale ? 'contact_locale' : 'push lang'}]`,
  send ? '(SENDING)' : '(dry run)',
)

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
