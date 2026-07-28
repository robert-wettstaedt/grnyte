import { defineConfig, devices } from '@playwright/test'

/**
 * The browser half of the test suite. Two specs, and they are the two things that are only correct
 * if a real browser, a real GoTrue and a real database agree: `invite.spec.ts` (local stack only,
 * it reads a mail catcher) and `prod-signup.spec.ts` (any environment). Branch coverage stays in
 * vitest.
 *
 * `reuseExistingServer` on purpose, including in CI-less local runs: the app on :3000 is also the
 * Zero get-queries endpoint that the running zero-cache talks to, so a second dev server would not
 * be the one under test. Specs assert their prerequisites up front rather than timing out.
 */

/** Set it to point the suite at a deployed environment; only `prod-signup.spec.ts` is portable
 *  enough to run there, so pass it a filter: `npm run test:e2e prod-signup`. */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
export default defineConfig({
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Escape hatch for environments that cannot download Playwright's bundled build (a
        // sandbox with an allowlist, an offline machine): point this at a local Chromium instead
        // of `npx playwright install`.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  reporter: 'list',
  retries: 0,
  testDir: 'e2e',
  // One test, and it is a whole journey: two Resend/SMTP round trips, a real signup, a poll for
  // the confirmation mail, and three Zero syncs. Per-step assertions still fail fast.
  timeout: 240_000,
  use: {
    baseURL: BASE,
    // The PWA service worker is enabled in dev (`devOptions.enabled` in vite.config). In a fresh
    // browser profile it installs mid-test and reloads the page under the test's feet, wiping
    // whatever was typed. Nothing here is about offline behaviour, so it is blocked outright.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  // Nothing to start when the target is already deployed somewhere.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        reuseExistingServer: true,
        timeout: 120_000,
        url: BASE,
      },
  workers: 1,
})
