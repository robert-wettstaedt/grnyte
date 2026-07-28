/**
 * The bits every spec needs. Here rather than duplicated per file, mostly so the `networkidle`
 * rationale below exists once: it is the sort of comment that rots the moment there are two copies.
 */
import type { Page } from '@playwright/test'

export async function reachableUrl(url: string): Promise<boolean> {
  return fetch(url, { signal: AbortSignal.timeout(3000) }).then(
    () => true,
    () => false,
  )
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
