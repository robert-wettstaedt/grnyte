import { readdirSync, readFileSync } from 'node:fs'

/**
 * Pushes `emails/gotrue/` to a hosted Supabase project's auth config. Run `generate.ts` first.
 *
 *   SUPABASE_ACCESS_TOKEN=<personal access token, Account > Access Tokens, NOT the service role key>
 *   PROJECT_REF=<subdomain of PUBLIC_SUPABASE_URL>
 *   DRY_RUN=true    print what would be sent and stop
 *
 * Exists because the equivalent shell one-liner does not survive contact with the templates:
 * accumulating the payload across a loop with `jq --argjson` re-parses the growing JSON every
 * iteration and dies on the embedded HTML.
 *
 * The readback at the end is the point. A template that fails to parse falls back to Supabase's
 * built-in default with no error, and GoTrue caches for up to ten minutes, so a 200 on the PATCH
 * says nothing about what will actually be sent.
 */

const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = process.env.PROJECT_REF
const dryRun = process.env.DRY_RUN === 'true'

if (token == null || token === '') throw new Error('push-templates: SUPABASE_ACCESS_TOKEN is required')
if (ref == null || ref === '') throw new Error('push-templates: PROJECT_REF is required')

const DIR = 'emails/gotrue'
const subjects: Record<string, string> = JSON.parse(readFileSync(`${DIR}/subjects.json`, 'utf8'))
const files = readdirSync(DIR)
  .filter((file) => file.endsWith('.html'))
  .sort()

const payload: Record<string, string> = {}
const report: { bytes: number; key: string }[] = []

for (const file of files) {
  const key = file.replace(/\.html$/, '')
  const subject = subjects[key]
  if (subject == null) throw new Error(`push-templates: no subject in subjects.json for ${key}`)

  const html = readFileSync(`${DIR}/${file}`, 'utf8')
  if (!html.includes('<html')) throw new Error(`push-templates: ${file} is not a rendered template`)

  payload[`mailer_subjects_${key}`] = subject
  payload[`mailer_templates_${key}_content`] = html
  report.push({ bytes: html.length, key })
}

// The logo origin is baked in at generation time rather than read from `{{ .SiteURL }}`, so a set
// of templates generated against the wrong `.env` ships somebody else's domain in production mail.
const origins = new Set(
  files.flatMap((file) =>
    [...readFileSync(`${DIR}/${file}`, 'utf8').matchAll(/https:\/\/([a-z0-9.-]+)\/pwa-192x192\.png/g)].map(
      (match) => match[1],
    ),
  ),
)

console.table(report)
console.log(`${files.length} templates, ${Object.keys(payload).length} config keys`)
console.log(`logo origin(s) baked in: ${[...origins].join(', ') || '(none found)'}`)

if (dryRun) {
  console.log('\nDRY RUN - nothing sent.')
} else {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    body: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    method: 'PATCH',
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`push-templates: ${response.status} ${text.slice(0, 800)}`)
  }

  const body = JSON.parse(text)
  console.log('\nRead back from the API:')
  console.table(
    report.map(({ key }) => ({
      bytes: (body[`mailer_templates_${key}_content`] ?? '').length,
      key,
      'subject matches': body[`mailer_subjects_${key}`] === subjects[key],
    })),
  )
}
