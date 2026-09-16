import { realpathSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

/**
 * The vitest config Stryker drives, for one project at a time.
 *
 * `STRYKER_PROJECT=server` picks the DB-backed half, which only `stryker/server.sh` runs; the
 * default is the jsdom half, which needs no database. One project either way, because Stryker runs
 * a vitest process per worker and `vitest-global-setup.ts` serialises runs that share a database:
 * every worker but the first would wait out its ten-minute lock and throw. The server half escapes
 * that by giving each worker a database of its own, below.
 */
const PROJECT = process.env.STRYKER_PROJECT === 'server' ? 'server' : 'browser'

/**
 * Stryker forces `pool: 'threads'`, and a worker thread keeps the timezone it started with: a test
 * that reassigns `process.env.TZ` mid-run reads the old zone and fails the initial test run.
 */
const THREAD_HOSTILE_TESTS = ['src/lib/entities/event/cardView.test.ts', 'src/lib/i18n/relativeTime.test.ts']

if (PROJECT === 'server') {
  // Stryker gives each test-runner child `STRYKER_MUTATOR_WORKER`, and the script starts one
  // Postgres per worker at `STRYKER_DB_BASE_PORT + i`. Assigned before `vite.config.ts` is imported,
  // which is what the dynamic import below is for: `db.server.ts` reads `DATABASE_URL` through
  // `$env/static/private`, baked from `process.env` when the config loads, once per process.
  const worker = Number(process.env.STRYKER_MUTATOR_WORKER ?? 0)
  const basePort = Number(process.env.STRYKER_DB_BASE_PORT ?? 54330)
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${basePort + worker}/postgres`
}

const { default: baseConfig } = await import('../vite.config.ts')

const project = (baseConfig.test?.projects ?? []).flatMap((candidate) => {
  if (typeof candidate !== 'object' || !('test' in candidate) || candidate.test?.name !== PROJECT) {
    return []
  }
  if (PROJECT === 'server') {
    return [candidate]
  }

  return [
    {
      ...candidate,
      test: { ...candidate.test, exclude: [...(candidate.test?.exclude ?? []), ...THREAD_HOSTILE_TESTS] },
    },
  ]
})

export default defineConfig({
  ...baseConfig,
  // Every sandbox symlinks the one real node_modules, so the default `node_modules/.vite` would have
  // all workers racing to rename the same dep-optimizer temp dir. Per process, because a sandbox is
  // reused across runs and two of them still collide inside it (ENOTEMPTY, intermittent).
  cacheDir: `.vite-stryker/${process.pid}`,
  // Stryker's sandbox symlinks node_modules back to the real one, which lands outside the sandbox
  // root: `svelteTesting()` injects its setup file as an absolute `/@fs/` id, and Vite refuses to
  // serve it. Without this every suite fails to import before a single test runs.
  server: {
    ...baseConfig.server,
    fs: { allow: [process.cwd(), realpathSync('node_modules')] },
  },
  test: {
    ...baseConfig.test,
    // Nothing left to serialise: either there is no database, or each worker has its own.
    globalSetup: [],
    projects: project,
  },
})
