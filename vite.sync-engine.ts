import { existsSync } from 'node:fs'
import type { Plugin } from 'vite'

const SYNC_ENGINES = ['zero', 'powersync'] as const
export type SyncEngine = (typeof SYNC_ENGINES)[number]

/** The build's sync engine, from `PUBLIC_SYNC_ENGINE`: unset is Zero, anything unknown fails the build. */
export function syncEngine(value: string | undefined): SyncEngine {
  if (value == null || value === '') return 'zero'
  const known = SYNC_ENGINES.find((engine) => engine === value)
  if (known == null) throw new Error(`PUBLIC_SYNC_ENGINE must be one of ${SYNC_ENGINES.join(', ')}, not "${value}"`)
  return known
}

const POWERSYNC_PACKAGE = /^@powersync\/|^@tanstack\/(db|svelte-db|powersync-db-collection)(\/|$)/

/** PowerSync code imports twins by their own path, so the twin resolver leaves it alone. */
const isPowerSyncCode = (id: string) => id.includes('/src/lib/powersync/') || /\.powersync\.[^/]*$/.test(id)

// Vitest inherits these plugins (`extends: true`): there the guard would refuse every PowerSync test, and the
// resolver would hand a twin's test the Zero file.
const outsideVitest = () => process.env.VITEST == null

/** PowerSync builds fail when any module imports the Zero client. A `new Zero` from `@rocicorp/zero` gets past this;
 *  only a `__zero` probe of the build or the page sees that. */
export function zeroClientGuard(): Plugin {
  return {
    apply: outsideVitest,
    enforce: 'pre',
    name: 'grnyte:zero-client-guard',
    async resolveId(source, importer, options) {
      const refuse = () =>
        this.error(
          `The PowerSync build imports the Zero client: "${source}" from ${importer?.split('?')[0] ?? 'the entry'}`,
        )
      if (source === 'zero-svelte') refuse()
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (resolved?.id.endsWith('/src/lib/zero/z.svelte.ts') === true) refuse()
      return null
    },
  }
}

/** Zero builds fail as soon as anything resolves a PowerSync module, so production ships none of it. */
export function zeroGuard(): Plugin {
  return {
    apply: outsideVitest,
    enforce: 'pre',
    name: 'grnyte:zero-guard',
    async resolveId(source, importer, options) {
      const refuse = () =>
        this.error(`The Zero build imports PowerSync code: "${source}" from ${importer ?? 'the entry'}`)
      if (POWERSYNC_PACKAGE.test(source)) refuse()
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (resolved != null && isPowerSyncCode(resolved.id)) refuse()
      return null
    },
  }
}

/** `resources.svelte.ts` → `resources.powersync.svelte.ts`, `engine.ts` → `engine.powersync.ts`. */
const twinOf = (id: string) => id.replace(/(\.svelte)?\.(ts|js)$/, '.powersync$1.$2')

/** PowerSync builds: a module with a twin beside it is swapped for the twin, except inside PowerSync code. */
export function twinResolver(): Plugin {
  return {
    apply: outsideVitest,
    enforce: 'pre',
    name: 'grnyte:powersync-twins',
    async resolveId(source, importer, options) {
      if (importer == null || isPowerSyncCode(importer)) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (resolved == null || isPowerSyncCode(resolved.id) || !/\.(ts|js)$/.test(resolved.id)) return null
      const twin = twinOf(resolved.id)
      return existsSync(twin) ? twin : null
    },
  }
}

const ASYNC_SQLITE_IMPORT = "await import('@journeyapps/wa-sqlite/dist/wa-sqlite-async.mjs')"

/**
 * PowerSync loads wa-sqlite's Asyncify build for IndexedDB unconditionally, and Safari 27 runs it ~10x slower after a
 * few seconds of work (WebKit 329813). Where the browser has JSPI the worker loads the cipher JSPI build instead, the
 * one JSPI build that carries the PowerSync core. Two literal imports: Vite does not rewrite a computed specifier.
 */
export const powerSyncJspi = (): Plugin => ({
  enforce: 'pre',
  name: 'grnyte:powersync-jspi',
  transform(code, id) {
    if (!id.includes('@powersync/web/lib/db/adapters/wa-sqlite/vfs.js')) return
    if (!code.includes(ASYNC_SQLITE_IMPORT)) {
      this.error('PowerSync no longer imports wa-sqlite-async.mjs as expected; recheck the JSPI swap')
    }
    return code.replace(
      ASYNC_SQLITE_IMPORT,
      "await (typeof WebAssembly.Suspending === 'function' ? import('@journeyapps/wa-sqlite/dist/mc-wa-sqlite-jspi.mjs') : import('@journeyapps/wa-sqlite/dist/wa-sqlite-async.mjs'))",
    )
  },
})
