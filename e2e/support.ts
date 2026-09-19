/**
 * The bits every spec needs. Here rather than duplicated per file, mostly so the `networkidle`
 * rationale below exists once: it is the sort of comment that rots the moment there are two copies.
 *
 * Imports no database module, so `prod-signup.spec.ts` does not drag in `testDb`'s pool.
 */
import { expect, type Browser, type Page } from '@playwright/test'

/** The same default the config resolves `baseURL` from. */
export const APP = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
export const ZERO = 'http://localhost:4848'

/**
 * Prerequisites named out loud, so a missing service reads as "start this". `extra` is for a spec
 * with prerequisites of its own. Refuses a non-local target: every caller signs in as a seed user,
 * writes through the app and cleans up against `DATABASE_URL`.
 */
export async function assertLocalStack(dbReachable: boolean, password: string, extra: string[] = []) {
  if (!isLocalTarget(APP)) {
    throw new Error(
      `This spec drives a local stack, but E2E_BASE_URL points at ${APP}.\n` +
        `It would sign in and write there for real. Only prod-signup.spec.ts is portable, so pass ` +
        `it a filter: npm run test:e2e prod-signup`,
    )
  }

  const missing = [...extra]

  if (!dbReachable) missing.push('local Supabase Postgres (DATABASE_URL is unreachable)')
  if (!(await reachableUrl(APP))) missing.push(`the app on ${APP} (npm run dev)`)
  if (!(await reachableUrl(ZERO))) missing.push('zero-cache on :4848 (npm run dev:zero)')
  if (!password) missing.push('E2E_PASSWORD in .env (the shared seed-login password)')

  if (missing.length > 0) {
    throw new Error(`e2e prerequisites are not running:\n  - ${missing.join('\n  - ')}`)
  }
}

/** Fail unless the page is still the document {@link markDocument} stamped. A full page load
 *  rebuilds the module singleton under test, so reaching the second entity with `goto` would make
 *  every assertion pass whether or not the bug is there. */
export async function assertSameDocument(page: Page, hop: string) {
  const survived = await page.evaluate(() => (window as unknown as { __e2eDoc?: boolean }).__e2eDoc === true)

  expect(
    survived,
    `${hop} replaced the document. That resets the module singleton under test, so the assertions ` +
      `after it would pass even with the bug present. Reach the second entity by clicking.`,
  ).toBe(true)
}

/** A form control by its `name`. Spelled out because `[name="..."]` also matches the
 *  `<meta name="description">` in the head. */
export function field(page: Page, name: string) {
  return page.locator(`input[name="${name}"], select[name="${name}"], textarea[name="${name}"]`)
}

/** Fields of the form under test, keyed by `name`; radios collapse to the checked one. Scoped to
 *  `form.elements` so the app shell's own inputs cannot answer, and sparse on purpose: an input
 *  that has not rendered is absent rather than empty. */
export async function formValues(page: Page): Promise<Record<string, string | undefined>> {
  return page.evaluate(() => {
    const form = document.querySelector('form')
    if (form == null) return {}

    const values: Record<string, string> = {}

    for (const control of Array.from(form.elements)) {
      const element = control as HTMLInputElement
      if (element.name == null || element.name === '') continue
      if (element.type === 'radio' || element.type === 'checkbox') {
        if (element.checked) values[element.name] = element.value
        continue
      }
      values[element.name] = element.value
    }

    return values
  })
}

/** A destructive row in the kebab sheet, which renders as a button rather than a link. */
export async function manageAction(page: Page, item: string) {
  await page.getByRole('button', { name: 'More' }).first().click()
  await page.getByRole('button', { exact: true, name: item }).first().click()
}

/** A navigating row in the kebab sheet. Named apart from {@link manageAction} because they differ
 *  by role. */
export async function manageLink(page: Page, item: string) {
  await page.getByRole('button', { name: 'More' }).first().click()
  await page.getByRole('link', { exact: true, name: item }).first().click()
}

/** Stamp the live document so {@link assertSameDocument} can tell whether it survived. */
export async function markDocument(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __e2eDoc?: boolean }).__e2eDoc = true
  })
}

export async function reachableUrl(url: string): Promise<boolean> {
  return fetch(url, { signal: AbortSignal.timeout(3000) }).then(
    () => true,
    () => false,
  )
}

/** Wait for the form at `url` to be seeded for `anchor`/`expected`, then read every field. The
 *  anchor has to come from the loaded entity: one derived from `page.params` flips with the URL and
 *  proves nothing. */
export async function readForm(
  page: Page,
  url: RegExp,
  anchor: string,
  expected: string,
): Promise<Record<string, string | undefined>> {
  await expect(page).toHaveURL(url)
  await expect(field(page, anchor)).toHaveValue(expected)
  // After the waits, never before: the page being left still carries the mark.
  await assertSameDocument(page, `the hop to ${url.source}`)

  return formValues(page)
}

/** A signed-in page, and the context to close in `afterAll`. A context rather than
 *  `browser.newPage()`, which would keep syncing for the rest of the run. */
export async function signedIn(browser: Browser, email: string, password: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signIn(page, email, password)

  return { context, page }
}

export async function signIn(page: Page, email: string, password: string) {
  await visit(page, '/auth/signin')

  // Precise hydration signal: `autofocus` here is a Svelte attachment, so focus only lands once the
  // component is alive.
  await expect(page.getByLabel('Email')).toBeFocused()

  await page.getByLabel('Email').fill(email)
  // By autocomplete, not by label: `AuthField` wraps the input and its "Forgot?" link in one
  // `<label>`, so the accessible name is not "Password".
  await page.locator('input[autocomplete="current-password"]').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/explore/)
}

/**
 * Navigate and wait for the page to be interactive.
 *
 * `networkidle` is normally discouraged, and it is the right tool here: the dev server ships
 * roughly 200 unbundled ES modules per page, so `load` fires long before the app hydrates, and a
 * click in that window lands on inert HTML and reports success while doing nothing.
 *
 * `path` is relative, so it resolves against the config's `baseURL` and every spec follows
 * `E2E_BASE_URL` without knowing it exists.
 */
export async function visit(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}

/** Loopback, whatever the port. Anything else is somebody's deployment. */
function isLocalTarget(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}
