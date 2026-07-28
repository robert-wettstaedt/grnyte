/**
 * Invite somebody to a region, sign them up from the emailed link, and let them join.
 *
 * The point of the exercise: this flow is only correct if the mail, the signup and the token line
 * up in a real browser. Everything that is a refusal rather than a journey lives in
 * `src/lib/entities/region/invite.server.test.ts`, and the invite mail's contents are asserted
 * there too, against `inviteEmailContent`, where they are data rather than a scrape.
 *
 * The invite mail DOES go out for real. `@grnyte.rocks` is a catch-all, so the per-run address
 * lands in a real inbox with a localhost link in it, which is exactly what you want when checking
 * a template. What the spec asserts instead of reading it is the "invitation sent" toast, which is
 * driven by `sendEmail`'s return value and so only appears when Resend accepted the message.
 *
 * The GoTrue confirmation mail is read for real from the local mail catcher, because
 * ENABLE_EMAIL_AUTOCONFIRM is false locally and that leg is otherwise untested.
 */
import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
// Relative, not `$lib`: this file runs in the Playwright process, which has no vite aliases.
// `testDb.ts` is plain node plus dotenv, so importing it first also loads `.env`.
import { reachable, seedUsers, sql, type SeedUser } from '../src/lib/db/testDb'
// Same reason, and it resolves for the same one: `dto.ts` imports nothing at runtime, only types.
import { acceptPath } from '../src/lib/entities/region/dto'
import { reachableUrl, visit } from './support'

const APP = 'http://localhost:3000'
const MAILBOX = 'http://localhost:9010'
const ZERO = 'http://localhost:4848'

const REGION = '__e2e_invite__'
const ADMIN = 'maintainer@grnyte.rocks'

/** Kept out of git: the seed logins are shared, so the password lives in `.env`. */
const PASSWORD = process.env.E2E_PASSWORD ?? ''

/** One address per run, so the mail is trivial to filter in the catch-all inbox afterwards. */
const invitee = `e2e-invite-${Date.now()}@grnyte.rocks`
const username = `e2e${Date.now()}`

let admin: SeedUser
let regionId = 0

/** Prerequisites named out loud, so a missing service reads as "start this" rather than as a
 *  mystery timeout ninety seconds in. */
async function assertPrerequisites() {
  const missing: string[] = []

  if (!reachable) missing.push('local Supabase Postgres (DATABASE_URL is unreachable)')
  if (!(await reachableUrl(APP))) missing.push(`the app on :3000 (npm run dev)`)
  if (!(await reachableUrl(ZERO))) missing.push('zero-cache on :4848 (npm run dev:zero)')
  if (!(await reachableUrl(`${MAILBOX}/api/v1/mailbox/e2e`))) {
    missing.push('supabase-mail on :9010 (the local Supabase stack)')
  }
  if (!process.env.RESEND_API_KEY) missing.push('RESEND_API_KEY in .env (the invite mail is sent for real)')
  if (!PASSWORD) missing.push('E2E_PASSWORD in .env (the shared seed-login password)')

  if (missing.length > 0) {
    throw new Error(`e2e prerequisites are not running:\n  - ${missing.join('\n  - ')}`)
  }
}

async function confirmationToken(address: string): Promise<string | undefined> {
  const box = `${MAILBOX}/api/v1/mailbox/${encodeURIComponent(address)}`
  const inbox = await fetch(box).then((response) => response.json())
  if (!Array.isArray(inbox) || inbox.length === 0) return undefined

  const message = await fetch(`${box}/${inbox[inbox.length - 1].id}`).then((response) => response.json())
  const body = `${message?.body?.html ?? ''}\n${message?.body?.text ?? ''}`

  return /[?&](?:token_hash|token)=([\w-]+)/.exec(body)?.[1]
}

/** The confirmation link GoTrue mailed, whichever template shape it used: our own
 *  `/auth/confirm?token_hash=` or the stock `/auth/v1/verify?token=`. Both carry the same hash,
 *  and our handler is what turns it into a session. */
async function confirmationUrl(address: string): Promise<string> {
  let token: string | undefined

  // Polled, never slept on: the mail lands whenever GoTrue's SMTP round trip finishes.
  await expect
    .poll(async () => (token = await confirmationToken(address)), {
      message: `no confirmation mail for ${address} in the local mail catcher`,
      timeout: 30_000,
    })
    .toBeTruthy()

  return `${APP}/auth/confirm?token_hash=${token}&type=signup&next=/explore`
}

/**
 * A member or invitation row on the region settings screen, by the text it carries.
 *
 * Scoped to the trigger button rather than matched with `getByText`, because `MemberRow` and
 * `InvitationRow` both hand their label to `Modal` as its `title` too, and `Modal.desktop`
 * renders that title into the DOM whether or not the sheet is open. Two matches, so a bare
 * `getByText` is a strict-mode violation waiting to happen. `filter({ hasText })` takes a plain
 * substring, so an address full of regex metacharacters needs no escaping.
 */
function rowFor(page: Page, text: string) {
  return page.getByRole('button').filter({ hasText: text })
}

async function signIn(page: Page, email: string, password: string) {
  await visit(page, '/auth/signin')

  // A precise hydration signal for this page: the email field's `autofocus` is implemented as a
  // Svelte attachment, so focus only lands once the component is alive. Without it the first
  // click hits server-rendered HTML with no submit handler yet and silently does nothing.
  await expect(page.getByLabel('Email')).toBeFocused()

  await page.getByLabel('Email').fill(email)
  // By autocomplete, not by label: `AuthField` wraps the input AND its trailing action in one
  // `<label>`, so this field's accessible name is "Password Forgot?" rather than "Password".
  // The signup page has no action link, so a label locator works there.
  await page.locator('input[autocomplete="current-password"]').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/explore/)
}

test.beforeAll(async () => {
  await assertPrerequisites()

  const seeds = await seedUsers({ admin: ADMIN })
  admin = seeds.admin

  await removeFixtures()
  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members)
    values (${REGION}, ${admin.userId}, 10) returning id`
  await sql`
    insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk)
    values (${regionId}, 'region_admin', true, ${admin.authId}, ${admin.userId})`
})

test.afterAll(async () => {
  // try/finally so the pool always closes: a teardown that throws half way through used to leave
  // the connection open and the run hanging on top of leaving rows behind.
  try {
    await removeFixtures()
    await deleteTestAccounts()
  } finally {
    await sql.end()
  }
})

test('an invited address signs up from the link and joins the region', async ({ browser }) => {
  const adminPage = await browser.newPage()

  // --- the admin invites --------------------------------------------------------------------
  await signIn(adminPage, ADMIN, PASSWORD)
  await visit(adminPage, `/settings/regions/${regionId}`)

  await adminPage.getByLabel('Email address').fill(invitee)
  await adminPage.getByRole('button', { exact: true, name: 'Invite' }).click()

  // Driven by sendEmail's return value, so it is the proof Resend accepted the message. The
  // generous timeout is the Resend round trip: the toast only renders once the send resolves,
  // and it auto-dismisses, so this has to be polling before it appears.
  await expect(adminPage.getByText(`Invitation sent to ${invitee}`)).toBeVisible({ timeout: 20_000 })
  await expect(rowFor(adminPage, invitee)).toBeVisible()

  // Same URL the mail carries, built by the same function; the vitest suite is what pins that.
  const [{ token }] = await sql<{ token: string }[]>`
    select token from public.region_invitations where region_fk = ${regionId} and email = ${invitee}`

  // --- the invitee opens it, signs up and confirms -------------------------------------------
  const inviteeContext = await browser.newContext()
  const page = await inviteeContext.newPage()

  await visit(page, acceptPath(token))
  await expect(page.getByText(REGION)).toBeVisible()

  await page.getByRole('link', { name: 'Create an account' }).click()
  // Same hydration gate as the sign-in page, for the same reason: the submit below is a Svelte
  // handler. The prefill assertion rides along, since `?email=` is what the accept screen passes.
  await expect(page.getByLabel('Email')).toBeFocused()
  await expect(page.getByLabel('Email')).toHaveValue(invitee)

  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Account created')).toBeVisible()

  await page.goto(await confirmationUrl(invitee))

  // --- the widened authGuard hook hands them the invitation ----------------------------------
  await page.waitForURL(/\/invite\/accept/)
  // Join is a Svelte click handler, so this leg needs the same wait for hydration that `visit`
  // does. It cannot use `visit` itself: the navigation here is the hook's redirect, not a goto.
  await page.waitForLoadState('networkidle')

  const join = page.getByRole('button', { name: `Join ${REGION}` })
  await expect(join).toBeVisible()
  await join.click()

  await page.waitForURL(/\/explore/)

  const [member] = await sql<{ role: string }[]>`
    select rm.role from public.region_members rm
    join auth.users au on au.id = rm.auth_user_fk
    where rm.region_fk = ${regionId} and au.email = ${invitee}`
  expect(member?.role).toBe('region_user')

  // The region is theirs now, which is what the settings list reads out of Zero. The longer
  // timeouts here and below are Zero replicating a server write into each client, which is the
  // one thing in this flow with no request to wait on.
  await visit(page, '/settings')
  await expect(page.getByText(REGION)).toBeVisible({ timeout: 20_000 })

  // --- and the admin sees them as a member, not as pending -----------------------------------
  await visit(adminPage, `/settings/regions/${regionId}`)
  await expect(rowFor(adminPage, username)).toBeVisible({ timeout: 20_000 })
  // Checked only after the member row has landed, so an unrendered page cannot pass it vacuously.
  await expect(adminPage.getByText(invitee)).toHaveCount(0)

  await inviteeContext.close()
  await adminPage.close()
})

/**
 * Remove every account this spec has ever made, not just this run's.
 *
 * The suite creates REAL auth users, so a run that dies mid-flight (or a teardown that trips on
 * one row) otherwise leaves them behind forever. Sweeping the whole `e2e-invite-` prefix makes
 * the next run clean up after the last one. The prefix is owned by this file, so nothing else
 * can match it.
 *
 * Every dependent row goes first and unscoped by region: by this point the account may have
 * joined, so it owns a membership and an activity that `removeFixtures` only clears for the
 * fixture region. Missing one of those is what makes the `public.users` delete fail and strand
 * the account. The auth user goes last, through the service role key rather than a raw delete,
 * so GoTrue tidies up its own bookkeeping (identities, sessions) with it.
 */
async function deleteTestAccounts() {
  const rows = await sql<{ id: string }[]>`select id from auth.users where email like 'e2e-invite-%@grnyte.rocks'`
  if (rows.length === 0) return

  // Matched by subquery rather than by a bound id array: `auth_user_fk` is a uuid, and a JS
  // string[] parameter would reach postgres as text[] and fail the comparison.
  const accounts = sql`select id from auth.users where email like 'e2e-invite-%@grnyte.rocks'`
  const appUsers = sql`select id from public.users where auth_user_fk in (${accounts})`

  await sql`update public.region_invitations set accepted_by = null where accepted_by in (${appUsers})`
  await sql`delete from public.activities where user_fk in (${appUsers})`
  await sql`delete from public.region_members where auth_user_fk in (${accounts})`
  await sql`update public.users set user_settings_fk = null where auth_user_fk in (${accounts})`
  await sql`delete from public.user_settings where auth_user_fk in (${accounts})`
  await sql`delete from public.users where auth_user_fk in (${accounts})`

  const url = process.env.PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url == null || key == null) return

  const admin = createClient(url, key, { auth: { persistSession: false } })
  for (const row of rows) {
    await admin.auth.admin.deleteUser(row.id)
  }
}

async function removeFixtures() {
  await sql`delete from public.activities where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.region_invitations where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.region_members where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.regions where name = ${REGION}`
}
