/**
 * Sign-up canary for a DEPLOYED environment. Makes a real account, confirms it, deletes it again.
 *
 * The gap this fills: `npm test` and `e2e/invite.spec.ts` run against a database that was created
 * five seconds ago, so they prove the code and nothing about the environment. Sign-up breaking in
 * production is invisible to both of them, and invisible to the people it happens to, because
 * somebody who cannot create an account has no way to complain. Sign-up is also the one flow with
 * no logged-in user to notice it is broken.
 *
 * Three things only production can be wrong about, and all three fail this spec:
 *   - GoTrue's own configuration (`npm run check:prod` asserts the toggles; this proves the flow)
 *   - the deployed schema still matching the code, via the `public.users` insert `signUp` does
 *   - SITE_URL and the redirect allowlist, via `properties.redirect_to` and the confirm handler
 *
 * ponytail: the confirmation link is minted with the service role rather than read out of an
 * inbox, so this does NOT prove the mail was delivered. That needs a mailbox with an API, and
 * `@grnyte.rocks` goes through SimpleLogin, which forwards rather than stores. Add an IMAP read of
 * the forward target (or point the canary at a throwaway inbox service) when a silent SMTP failure
 * is the thing that actually bites, and drop `confirmationLink` in favour of it.
 *
 * Run it against production with the production values in the environment:
 *
 *   E2E_BASE_URL=... DATABASE_URL=... PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... E2E_PASSWORD=... npm run test:e2e prod-signup
 *
 * `E2E_BASE_URL` and `DATABASE_URL` have to name the same environment; nothing checks that. With
 * neither set it runs against the local stack, which is also how it stays honest.
 */
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
// Relative, not `$lib`: the Playwright process has no vite aliases. `testAccounts`, not `testDb`,
// which opens a pool of its own at import.
import { connect, deleteAccountRows } from '../src/lib/db/testAccounts'
import { REGION_CREATE_PATH } from '../src/lib/entities/region/dto'
import { reachableUrl, visit } from './support'

// Playwright does not read `.env`; CI passes the real values as environment variables instead,
// and those win, because `loadEnvFile` never overwrites what is already set.
try {
  process.loadEnvFile('.env')
} catch {
  // No `.env` at all is the CI case, and the prerequisite check below names whatever is missing.
}

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

/** Reused rather than given its own secret: any password works for a throwaway account. */
const PASSWORD = process.env.E2E_PASSWORD ?? ''

/** One per run, and the prefix is owned by this file, so the sweep in `afterAll` cannot hit
 *  anything else. Deliberately the same shape as the invite spec's. */
const stamp = Date.now()
const email = `e2e-signup-${stamp}@grnyte.rocks`
const username = `e2e${stamp}`

/** GoTrue's admin API only. The Data API is off in every environment
 *  (`pgrst.db_schemas = rest_disabled` on `authenticator`), so app tables need a postgres
 *  connection. */
const admin = createClient(process.env.PUBLIC_SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { persistSession: false },
})

const sql = connect()

/** Captured as soon as it exists, so teardown can delete the account even if the test fails
 *  afterwards. A run that dies before the link is minted leaves an orphan auth user behind, which
 *  is the one case a prefix sweep would catch and this does not - not worth listing every user in
 *  a production project for. */
let authUserId: string | undefined

test.beforeAll(async () => {
  const missing: string[] = []

  if (!(await reachableUrl(BASE))) missing.push(`the app at ${BASE}`)
  if (!process.env.PUBLIC_SUPABASE_URL) missing.push('PUBLIC_SUPABASE_URL')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY (the account is deleted again)')
  if (!PASSWORD) missing.push('E2E_PASSWORD')
  // Probed, not just read: a dead connection string otherwise fails mid-journey, with an account
  // already created.
  const connected = await sql`select 1`.then(
    () => true,
    () => false,
  )
  if (!connected) missing.push(`DATABASE_URL reaching the database behind ${BASE}`)

  if (missing.length > 0) {
    throw new Error(`prod-signup prerequisites are missing:\n  - ${missing.join('\n  - ')}`)
  }
})

test.afterAll(async () => {
  // try/finally so the pool always closes, even on the failure this exists to report.
  try {
    if (authUserId == null) return

    const failed = await deleteAccountRows(sql, [authUserId]).then(
      () => undefined,
      (reason: unknown) => reason,
    )

    // Through the admin API rather than a delete on `auth.users`, so GoTrue tidies up its own
    // bookkeeping (identities, sessions) with it. Attempted even when the rows above failed, so a
    // teardown that trips does not also leave a usable login.
    const { error } = await admin.auth.admin.deleteUser(authUserId)
    if (failed != null) throw failed
    if (error != null) {
      throw new Error(`prod-signup left ${email} behind: ${error.message}`)
    }
  } finally {
    await sql.end()
  }
})

test('a new account can sign up and confirm', async ({ page }) => {
  await visit(page, '/auth/signup')

  // A precise hydration signal for this page: the email field's `autofocus` is implemented as a
  // Svelte attachment, so focus only lands once the component is alive. Without it the submit
  // below hits server-rendered HTML with no handler yet and silently does nothing.
  await expect(page.getByLabel('Email')).toBeFocused()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByText('Account created')).toBeVisible()

  // Minted before the assertions below rather than after: it is what hands teardown the account,
  // so an assertion that fails cannot strand a confirmed production login.
  const link = await confirmationLink()

  // The app-level rows, which is the half of `signUp` that lives in our schema rather than in
  // GoTrue. A migration that never reached this environment fails right here, and it is the
  // failure a disposable CI database structurally cannot produce.
  const rows = await sql<{ authUserFk: string; userSettingsFk: null | number }[]>`
    select auth_user_fk as "authUserFk", user_settings_fk as "userSettingsFk"
    from public.users where username = ${username}`
  // A `DATABASE_URL` for another environment lands here too, hence the hint.
  expect(rows, `public.users row for ${username} (is DATABASE_URL the database behind ${BASE}?)`).toHaveLength(1)
  expect(rows[0]?.userSettingsFk, 'user_settings linked back to the user').not.toBeNull()

  await page.goto(link)

  // Not `/explore`: a region-less account is bounced from there to the create screen. Both are
  // behind the guard, so landing here rather than at `/auth` is the assertion - the token became
  // a session.
  await page.waitForURL(`**${REGION_CREATE_PATH}`)
})

/**
 * The confirmation link GoTrue would have mailed, minted with the service role.
 *
 * `type: 'signup'` on an address that already signed up and has not confirmed yet re-issues the
 * token rather than refusing, which is exactly the state the form leaves behind. The returned
 * `redirect_to` is the project's SITE_URL, so it is asserted here for free: a wrong one sends
 * every real confirmation mail to the wrong host.
 */
async function confirmationLink(): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ email, password: PASSWORD, type: 'signup' })

  expect(error, 'minting a confirmation link').toBeNull()

  // GoTrue's own answer for who this address is, so teardown has the account before anything else
  // can fail.
  authUserId = data.user?.id

  const siteUrl = data.properties?.redirect_to.replace(/\/$/, '')
  expect(siteUrl, "the project's SITE_URL").toBe(BASE.replace(/\/$/, ''))

  return `${BASE}/auth/confirm?token_hash=${data.properties?.hashed_token}&type=signup&next=/explore`
}
