// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { syncEngine, twinResolver, zeroClientGuard, zeroGuard } from './vite.sync-engine'

/** Calls a plugin's `resolveId` the way Vite does, with `this.resolve` mapping a specifier to `resolved`. */
async function resolve(
  plugin: ReturnType<typeof twinResolver>,
  source: string,
  importer: string | undefined,
  resolved?: string,
) {
  const hook = plugin.resolveId as (this: unknown, source: string, importer?: string, options?: object) => unknown
  const context = {
    error: (message: string) => {
      throw new Error(message)
    },
    resolve: async () => (resolved == null ? null : { id: resolved }),
  }
  return await hook.call(context, source, importer, {})
}

/** A source tree with an entity's resources and its twin, and an engine module without one. */
function tree() {
  const root = mkdtempSync(path.join(tmpdir(), 'engine-'))
  const area = path.join(root, 'src/lib/entities/area')
  const state = path.join(root, 'src/lib/state')
  mkdirSync(area, { recursive: true })
  mkdirSync(state, { recursive: true })
  for (const file of [
    path.join(area, 'resources.svelte.ts'),
    path.join(area, 'resources.powersync.svelte.ts'),
    path.join(state, 'engine.ts'),
    path.join(state, 'engine.powersync.ts'),
    path.join(state, 'wipe.ts'),
  ])
    writeFileSync(file, '')
  return { area, root, state }
}

describe('syncEngine', () => {
  it('builds Zero when unset and refuses a value it does not know', () => {
    expect(syncEngine(undefined)).toBe('zero')
    expect(syncEngine('')).toBe('zero')
    expect(syncEngine('powersync')).toBe('powersync')
    expect(() => syncEngine('powersynk')).toThrow(/zero, powersync/)
  })
})

describe('zeroGuard', () => {
  it.each(['@powersync/web', '@tanstack/db', '@tanstack/svelte-db', '@tanstack/powersync-db-collection'])(
    'refuses %s',
    async (source) => {
      await expect(resolve(zeroGuard(), source, '/app/src/routes/+layout.ts')).rejects.toThrow(/Zero build/)
    },
  )

  it('refuses a module under src/lib/powersync and a twin, by where they resolve', async () => {
    await expect(
      resolve(zeroGuard(), '$lib/powersync/db.svelte', '/app/src/x.ts', '/app/src/lib/powersync/db.svelte.ts'),
    ).rejects.toThrow(/Zero build/)
    await expect(
      resolve(zeroGuard(), './resources.powersync.svelte', '/app/src/x.ts', '/app/src/resources.powersync.svelte.ts'),
    ).rejects.toThrow(/Zero build/)
  })

  it('lets Zero code through', async () => {
    expect(
      await resolve(zeroGuard(), '$lib/zero/z.svelte', '/app/src/x.ts', '/app/src/lib/zero/z.svelte.ts'),
    ).toBeNull()
  })
})

describe('zeroClientGuard', () => {
  const client = '/app/src/lib/zero/z.svelte.ts'

  it('refuses the Zero client to every module, the engine too, and names it', async () => {
    await expect(resolve(zeroClientGuard(), './z.svelte', '/app/src/lib/zero/new.ts', client)).rejects.toThrow(
      /src\/lib\/zero\/new\.ts/,
    )
    await expect(
      resolve(zeroClientGuard(), '$lib/zero/z.svelte', '/app/src/lib/state/engine.powersync.ts?v=1', client),
    ).rejects.toThrow(/src\/lib\/state\/engine\.powersync\.ts/)
  })

  it('refuses zero-svelte, which is the client itself', async () => {
    await expect(
      resolve(zeroClientGuard(), 'zero-svelte', '/app/src/x.ts', '/app/node_modules/zero-svelte/dist/index.js'),
    ).rejects.toThrow(/src\/x\.ts/)
  })

  it('lets the Zero package and any other import through', async () => {
    const zero = '/app/node_modules/@rocicorp/zero/out/zero.js'

    expect(await resolve(zeroClientGuard(), '@rocicorp/zero', '/app/src/lib/state/pwa/wipe.ts', zero)).toBeNull()
    expect(await resolve(zeroClientGuard(), './other', '/app/src/x.ts', '/app/src/lib/other.ts')).toBeNull()
  })
})

describe('twinResolver', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('swaps a module for its twin, relative or aliased, .svelte.ts or plain', async () => {
    const { area, state } = tree()
    const importer = path.join(area, '../../../routes/page.svelte')
    const resources = path.join(area, 'resources.svelte.ts')

    expect(await resolve(twinResolver(), './resources.svelte', importer, resources)).toBe(
      path.join(area, 'resources.powersync.svelte.ts'),
    )
    expect(await resolve(twinResolver(), '$lib/entities/area/resources.svelte', importer, resources)).toBe(
      path.join(area, 'resources.powersync.svelte.ts'),
    )
    expect(await resolve(twinResolver(), './engine', importer, path.join(state, 'engine.ts'))).toBe(
      path.join(state, 'engine.powersync.ts'),
    )
  })

  it('leaves a module without a twin, and every import made by PowerSync code', async () => {
    const { area, root, state } = tree()
    const resources = path.join(area, 'resources.svelte.ts')

    expect(await resolve(twinResolver(), './wipe', path.join(state, 'x.ts'), path.join(state, 'wipe.ts'))).toBeNull()
    expect(await resolve(twinResolver(), './resources.svelte', path.join(area, 'x.powersync.ts'), resources)).toBeNull()
    expect(
      await resolve(
        twinResolver(),
        '$lib/entities/area/resources.svelte',
        path.join(root, 'src/lib/powersync/x.ts'),
        resources,
      ),
    ).toBeNull()
  })

  it('acts in builds and the dev server, never under vitest', () => {
    const apply = (plugin: ReturnType<typeof twinResolver>) => (plugin.apply as () => boolean)()
    expect(apply(twinResolver())).toBe(false)
    expect(apply(zeroGuard())).toBe(false)
    vi.stubEnv('VITEST', undefined)
    expect(apply(twinResolver())).toBe(true)
    expect(apply(zeroGuard())).toBe(true)
  })
})

// SvelteKit builds `src/sw.ts` apart, with `configFile: false`, so no plugin of this config sees it.
describe('the service worker', () => {
  const sourceOf = (file: string) =>
    [file, `${file}.ts`, `${file}.svelte.ts`, `${file}.js`, path.join(file, 'index.ts')].find(
      (candidate) => /\.(ts|js)$/.test(candidate) && existsSync(candidate),
    )

  it('imports nothing the Zero guard refuses, however deep', async () => {
    const src = path.resolve('src')
    const seen = new Set<string>()
    const walk = async (file: string): Promise<void> => {
      if (seen.has(file)) return
      seen.add(file)
      for (const [, specifier] of readFileSync(file, 'utf8').matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
        const local = specifier.startsWith('.')
          ? path.resolve(path.dirname(file), specifier)
          : specifier.startsWith('$lib/')
            ? path.join(src, 'lib', specifier.slice(5))
            : undefined
        const resolved = local == null ? undefined : sourceOf(local)
        await resolve(zeroGuard(), specifier, file, resolved)
        if (resolved != null) await walk(resolved)
      }
    }

    await walk(path.join(src, 'sw.ts'))

    expect(seen.size).toBeGreaterThan(5)
  })
})
