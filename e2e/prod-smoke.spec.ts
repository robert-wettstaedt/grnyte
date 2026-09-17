/**
 * Smoke test for a deployed environment. Run it right after a deploy.
 *
 * `prod-signup.spec.ts` proves that a person can create an account. This proves that the app works
 * for an account that exists already. A cutover breaks that half. A migration that applied only in
 * part, a Zero replica that never bootstrapped, and a moved `.remote.ts` endpoint id all leave
 * sign-up healthy.
 *
 * The dullest assertion is the one that matters most: the app must get past its loading splash. A
 * dead Zero sync shows that splash forever and logs no error. The replica wipe and the bootstrap in
 * the cutover can leave exactly that behind.
 *
 * This spec creates nothing and edits nothing, but it is not free of writes. `/feed` stamps
 * `seenUpToEventAt` on mount, and `/notifications` stamps every row as read. Against a person's
 * account, that silences their next digest for events they never saw. The spec therefore stays off
 * both routes, and the account it signs in as must belong to nobody.
 *
 * It names no crag. It reads one route id from the database instead, so it keeps working as the
 * guidebook changes and against any environment.
 *
 * To run it against production, put the production values in the environment:
 *
 *   E2E_BASE_URL=... DATABASE_URL=... \
 *   E2E_SMOKE_EMAIL=... E2E_SMOKE_PASSWORD=... npm run test:e2e prod-smoke
 *
 * `E2E_BASE_URL` and `DATABASE_URL` must name the same environment. Nothing checks that. With
 * neither set, the spec runs against the local stack, which is what keeps it honest.
 */
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'
// A relative path, because the Playwright process has no vite aliases. `testAccounts` and not
// `testDb`, because `testDb` opens a pool of its own at import.
import { connect } from '../src/lib/db/testAccounts'
import { reachableUrl, signIn, visit } from './support'

try {
  process.loadEnvFile('.env')
} catch {
  // CI has no `.env` at all. The prerequisite check below names whatever is missing.
}

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

/** Its own credentials, not the seed logins. Against a deployed environment this signs in for
 *  real, so the account must be one that no person reads. */
const EMAIL = process.env.E2E_SMOKE_EMAIL ?? 'admin@grnyte.rocks'
const PASSWORD = process.env.E2E_SMOKE_PASSWORD ?? process.env.E2E_PASSWORD ?? ''

const sql = connect()

/** `toHaveTitle` takes a pattern, and a guidebook name can hold any character. */
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Console noise that must not fail this spec. Each entry gives its reason.
 *
 * Keep the list short. Every entry is something this spec can no longer tell you about.
 */
const IGNORED = [
  {
    // `serviceWorkers: 'block'` in playwright.config.ts makes the worker script return 404.
    // workbox-window then reads `registration.waiting` off undefined. The harness causes both.
    pattern: /workbox-window|sw\.js|Failed to load resource/,
    why: 'the harness blocks service workers',
  },
  {
    // Skeleton's Toaster raises this on /explore, several times per load. It is older than this
    // spec and older than the logging that surfaced it: `client_error_logs` held it on 2026-09-16,
    // hours before `toast.ts` changed. The frame is a Svelte internal, not app code.
    pattern: /invariant_violation|Batch has scheduled roots/,
    why: 'known Svelte/Skeleton Toaster bug on /explore, tracked separately',
  },
]

/** What the app logged at error level during a run, less {@link IGNORED}. A page that renders
 *  while it throws is half working, and the splash case shows up here first. */
const consoleErrors: string[] = []

const record = (page: Page, text: string) => {
  if (IGNORED.some(({ pattern }) => pattern.test(text))) return
  consoleErrors.push(`${page.url()}: ${text}`)
}

const collectErrors = (page: Page) => {
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') record(page, message.text())
  })
  page.on('pageerror', (error) => record(page, error.message))
}

/**
 * The newest route that the signed-in account can read. The query only reads, and it is what keeps
 * this spec from naming a crag that the target environment can lack.
 *
 * It is scoped to the active memberships of that account, not to the newest route in the database.
 * A region is a closed container. An unscoped pick lands on a route the account cannot see, and the
 * spec then fails for a reason that has nothing to do with the deploy.
 */
async function newestReadableRoute(): Promise<undefined | { blockFk: number; id: number; name: null | string }> {
  const [row] = await sql<{ blockFk: number; id: number; name: null | string }[]>`
    select r.id, r.name, r.block_fk as "blockFk"
    from public.routes r
    join public.region_members rm on rm.region_fk = r.region_fk
    join public.users u on u.id = rm.user_fk
    join auth.users au on au.id = u.auth_user_fk
    where r.deleted_at is null and rm.is_active and au.email = ${EMAIL}
    order by r.id desc
    limit 1
  `
  return row
}

test.beforeAll(async () => {
  const missing: string[] = []

  if (!(await reachableUrl(BASE))) missing.push(`the app on ${BASE}`)
  if (!PASSWORD) missing.push('E2E_SMOKE_PASSWORD (or E2E_PASSWORD) in the environment')

  const reachable = await sql`select 1`.then(
    () => true,
    () => false,
  )
  if (!reachable) missing.push('DATABASE_URL (this spec reads one route id from it)')

  if (missing.length > 0) {
    throw new Error(`prod-smoke prerequisites are not met:\n  - ${missing.join('\n  - ')}`)
  }
})

test.afterAll(async () => {
  await sql.end()
})

test('a deployed environment serves a signed-in reader', async ({ page }) => {
  collectErrors(page)

  await signIn(page, EMAIL, PASSWORD)

  // Past the splash, which is the whole point. `signIn` waited for /explore already, so a rendered
  // shell here means the session, the app and the preload queries all answered.
  await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Search areas, blocks, routes' })).toBeVisible()

  const route = await newestReadableRoute()
  expect(route, `no route is readable by ${EMAIL} in the target environment`).toBeTruthy()
  if (route == null) return

  // An id-based URL, because that is the shape that survives a deploy. Slugs did not.
  await visit(page, `/routes/${route.id}`)

  // The title comes from the mapper of the entity, so the app reads the row here. It does not echo
  // the URL. A guidebook name is not a pattern, so the match is literal.
  await expect(page).toHaveTitle(new RegExp(escapeRegExp(route.name ?? String(route.id))))

  // The breadcrumb proves that the related rows synced, not only the route. A replica that
  // bootstrapped in part renders the route and loses its parents.
  await expect(page.locator(`a[href$="/blocks/${route.blockFk}"]`)).toBeVisible()

  await visit(page, '/profile')
  await expect(page.getByText('Grade pyramid')).toBeVisible()

  // Last on purpose. A failure above names the problem better than "something logged an error".
  expect(consoleErrors, `the app logged errors:\n${consoleErrors.join('\n')}`).toEqual([])
})
