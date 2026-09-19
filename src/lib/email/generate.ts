import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { BRAND } from './brand.cli'
import { renderEmailHtml } from './shell'
import { GOTRUE_TEMPLATES } from './templates'

/**
 * Renders the GoTrue templates to `emails/gotrue/`. Run with `npm run generate`.
 *
 * Hosted Supabase has no config.toml, so these are pasted into the dashboard
 * (Authentication > Emails) or PATCHed via the Management API:
 *
 *   curl -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
 *     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
 *     -d '{"mailer_subjects_invite": "...", "mailer_templates_invite_content": "<html>..."}'
 *
 * Never hand-edit the output or the dashboard copy. Both drift silently, and nobody notices
 * for months because these emails are only ever seen by people who are not you.
 */

const OUT = 'emails/gotrue'

// This output is committed and pasted into the dashboard, so a dev `.env` pointing at localhost
// would bake a dead logo and a dead button into all 13 templates, with nothing downstream noticing.
if (new URL(BRAND.origin).protocol !== 'https:') {
  throw new Error(
    `PUBLIC_ORIGIN is ${BRAND.origin}, which is not the public origin these templates ship with. Re-run as PUBLIC_ORIGIN=https://<public origin> npm run generate`,
  )
}

mkdirSync(OUT, { recursive: true })

const subjects: Record<string, string> = {}

for (const [key, content] of Object.entries(GOTRUE_TEMPLATES)) {
  // The logo origin is hardcoded rather than `{{ .SiteURL }}`: a Site URL entered with a
  // trailing slash in the dashboard would produce `//pwa-192x192.png`, and we cannot strip it
  // at render time because the value is a Go expression. A staging send showing the production
  // logo is a decorative image loading from the wrong host, which costs nothing.
  writeFileSync(`${OUT}/${key}.html`, renderEmailHtml({ ...content, brand: BRAND, locale: 'en' }))
  subjects[key] = content.subject
}

writeFileSync(`${OUT}/subjects.json`, `${JSON.stringify(subjects, null, 2)}\n`)

console.log(`wrote ${Object.keys(subjects).length} templates to ${OUT}/`)
