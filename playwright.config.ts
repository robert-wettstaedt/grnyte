import { defineConfig, devices } from '@playwright/test'

/**
 * The browser half of the test suite: the things that are only correct if a real browser, a real
 * GoTrue and a real database agree. `invite.spec.ts` (local stack only, it reads a mail catcher),
 * `prod-signup.spec.ts` and `prod-smoke.spec.ts` (any environment), `form-seeding.spec.ts` and
 * `undo-restore.spec.ts`. Branch coverage stays in vitest.
 *
 * The last two watch state that outlives a component, and each owns its database pool: Playwright
 * runs spec files in one worker process, so `testDb`'s exported `sql` is shared and a file that
 * ends it strands every file after it.
 *
 * `reuseExistingServer` on purpose, including in CI-less local runs: the app on :3000 is also the
 * Zero get-queries endpoint that the running zero-cache talks to, so a second dev server would not
 * be the one under test. Specs assert their prerequisites up front rather than timing out.
 */

/** Set it to point the suite at a deployed environment; only `prod-signup.spec.ts` and
 *  `prod-smoke.spec.ts` are portable enough, so pass a filter: `npm run test:e2e prod-smoke`.
 *  It has to be EXPORTED: `source .env` sets a shell variable node never sees, so the suite
 *  silently falls back to localhost and starts a dev server against whatever `.env` points at. */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
export default defineConfig({
  expect: {
    // Raised off Playwright's 5s default, which `actionTimeout` does not cover. The seeding specs
    // wait on a click, a client-side navigation and a Zero query, which outlasts it on a cold dev
    // server.
    timeout: 30_000,
  },
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
  // Sized for `invite.spec.ts`, the one whole-journey test. Everything else is bounded by
  // `expect.timeout` and `actionTimeout`.
  timeout: 240_000,
  use: {
    // Without it a click on something absent holds the whole 240s and reads as a hang.
    actionTimeout: 30_000,
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
