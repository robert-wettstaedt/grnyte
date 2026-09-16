// @ts-check

/**
 * One config for both halves. `STRYKER_PROJECT=server` picks the DB-backed one, which only
 * `stryker/server.sh` runs and which needs a Postgres per worker; the default needs nothing.
 *
 * Stryker copies the whole working directory into a sandbox per worker and does NOT read
 * .gitignore, so anything heavy has to be named in `ignorePatterns` by hand.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
const server = process.env.STRYKER_PROJECT === 'server'

export default {
  $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
  // One vite server per worker, and one per core fails project setup on a 12-core mac.
  concurrency: 4,
  ignorePatterns: [
    '.agents',
    // Agent worktrees: whole checkouts of this repo.
    '.claude',
    // No secret is copied into `.stryker-tmp`, and a sandbox that denies reading `.env` (this
    // repo's agent sandboxes do) can still run this. Both halves supply what the sandbox's
    // `vite.config.ts` needs from the environment instead: it throws without
    // `PUBLIC_APPLICATION_NAME`, and nothing under test reads a real value for any of the rest.
    '.env*',
    '.mcp.json',
    '.memlab',
    '.vercel',
    '.vite-stryker',
    '.vscode',
    'brand/capture',
    'build',
    'dev-dist',
    'drizzle',
    'e2e',
    'emails',
    'playwright-report',
    'reports',
    'storybook-static',
    'test-results',
  ],
  incremental: true,
  // Deliberately narrow. Whole-repo mutation is tens of thousands of mutants against 124 test
  // files; widen one directory at a time. `.server.ts` and `.remote.ts` are excluded because their
  // tests live in the project this half drops, so every mutant would survive. The server half never
  // reads this: `stryker/server.sh` requires a target and passes `--mutate`.
  mutate: ['src/lib/entities/topo/**/*.ts', '!src/**/*.test.ts', '!src/**/*.server.ts', '!src/**/*.remote.ts'],
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  // A handler talks to the database on nearly every mutant, so the server half is slower than the
  // client one: 5s is not enough where a pooled connection has to be established first.
  timeoutMS: server ? 30_000 : 5_000,
  vitest: { configFile: 'stryker/vitest.config.ts' },
}
