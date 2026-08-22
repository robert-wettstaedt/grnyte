import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { svelteTesting } from '@testing-library/svelte/vite'
import { SvelteKitPWA } from '@vite-pwa/sveltekit'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

const file = fileURLToPath(new URL('package.json', import.meta.url))
const json = readFileSync(file, 'utf8')
const pkg = JSON.parse(json)

/**
 * True once SvelteKit's own `writeBundle` has finished the SSR pass, which is where it emits
 * `.svelte-kit/output/client/service-worker.js`. Anything that kills the build before that point
 * (an unresolved import, a Svelte compile error, a failing prerender) leaves it false.
 */
let serviceWorkerEmitted = false

const trackServiceWorkerEmit: Plugin = {
  apply: 'build',
  name: 'grnyte:track-service-worker-emit',
  writeBundle: {
    // `post` + `sequential` so this observes SvelteKit's own `writeBundle` *completing*, and `dir`
    // to tell the SSR pass (the one that emits the worker) from the client build SvelteKit starts
    // from inside that same hook.
    handler(options) {
      if (options.dir?.replaceAll('\\', '/').endsWith('/server') === true) {
        serviceWorkerEmitted = true
      }
    },
    order: 'post',
    sequential: true,
  },
}

/**
 * Report why a build failed, instead of reporting the service worker it never got as far as
 * building.
 *
 * `@vite-pwa/sveltekit` pins both its build plugin and that plugin's `closeBundle` hook to
 * `enforce: 'pre'` (`dist/index.mjs`: `SvelteKitPlugin`, plus `integration.closeBundleOrder`), so
 * it is the first `closeBundle` to run and nothing ordered after it can step in. Vite calls
 * `bundle.close()` from a `finally`, so that hook runs even when the build has already thrown: it
 * looks for `.svelte-kit/output/client/service-worker.js`, which SvelteKit only emits at the very
 * end of its own `writeBundle`, and throws ENOENT. A throw inside a `finally` replaces the
 * exception on its way out, which is why every failing build was reported as
 * `[vite-plugin-pwa:sveltekit:build] ... swSrc ... ENOENT` and the real cause was never printed.
 *
 * So the injection is skipped, loudly, exactly when SvelteKit never emitted a worker. A build that
 * did finish still runs the hook untouched, so a worker that is genuinely missing (a renamed
 * `src/sw.ts`, say) still fails the build with the ENOENT it deserves.
 *
 * Delete this once the upstream hook is ordered after SvelteKit's.
 */
function unmaskBuildFailure(plugin: Plugin): Plugin {
  const hook = plugin.closeBundle

  if (plugin.name !== 'vite-plugin-pwa:sveltekit:build' || hook == null || typeof hook === 'function') {
    return plugin
  }

  const inject = hook.handler

  return {
    ...plugin,
    closeBundle: {
      ...hook,
      handler(...args) {
        if (serviceWorkerEmitted) {
          return inject.apply(this, args)
        }

        console.error(
          '[pwa] skipped the service worker manifest injection: the build failed before SvelteKit emitted a service worker. The real failure is reported below.',
        )
      },
    },
  }
}

export default defineConfig({
  // The emoji picker fetches its data at runtime, so this JSON has to stay JSON. Without this it
  // goes through Vite's JSON plugin and the dev server answers the fetch with an ES module, which
  // the picker reports as "Could not load emoji" - a 200 whose body is JavaScript.
  //
  // Imported as an asset rather than copied into `static/`, so the ~450KB per locale stays out of
  // the repo, gets a hashed filename, and can never drift from the installed package.
  assetsInclude: ['**/emoji-picker-element-data/**/*.json'],
  build: {
    // Pinned, not raised, and pinned at exactly what Vite already resolves to today, so this
    // changes no output. Left unset, the floor is Vite's `baseline-widely-available` default:
    // Baseline Widely as of a date frozen per Vite major (8 uses 2026-01-01), which is roughly
    // 30 months behind the front of the web by design and moves silently on a Vite upgrade.
    // Pinning turns that into a reviewed diff.
    //
    // Raising it was measured and buys nothing: application JS is byte-identical at safari17.4
    // and six bytes LARGER at safari18. The only construct lowered at this floor is the `v`-flag
    // regex in entities/reaction/dto.ts, which tree-shakes into the server bundle. The CSS saving
    // (193 to 557 bytes gzipped) is smaller than this build's own run-to-run variance. The cost
    // would be every iPhone hardware-capped at iOS 16.x, on a PWA used outdoors on old phones.
    //
    // Do NOT use safari17.5: lightningcss stops lowering `light-dark()` there, and Skeleton's
    // palette uses it, so Safari 16.4 to 17.4 would lose the theme colours.
    //
    // firefox115 rather than the default's 114: `Array.prototype.toSorted` is Firefox 115, and
    // map/Map.svelte, CreateOnMap.svelte and Markdown/lib/remark-grades.ts use it with no
    // fallback. Firefox 114 gets a TypeError, not a cosmetic degradation.
    //
    // Two things this does not cover. Pre-bundled node_modules deps are transformed at Vite's
    // hardcoded constant regardless, and SvelteKit builds src/sw.ts in a separate Vite build with
    // `configFile: false`, so this never reaches the service worker. Neither matters while the
    // target moves zero JS bytes, but both matter if that ever stops being true.
    target: ['chrome111', 'edge111', 'firefox115', 'safari16.4', 'ios16.4'],
  },
  define: {
    __APP_REPO__: JSON.stringify(pkg.repository.url),
  },
  plugins: [
    paraglideVitePlugin({
      outdir: './src/lib/paraglide',
      project: './project.inlang',
      // globalVariable first: getLocale() re-runs this chain on every m.*() call, and the
      // cookie strategy parses document.cookie each time (~80ms on /explore's initial load).
      // setLocale keeps the cookie in sync, so the in-memory variable can safely win.
      strategy: ['globalVariable', 'cookie', 'preferredLanguage', 'baseLocale'],
    }),
    tailwindcss(),
    sveltekit(),
    svelteTesting(),
    ...SvelteKitPWA({
      base: '/',
      devOptions: {
        enabled: true,
        navigateFallback: '/',
        suppressWarnings: process.env.SUPPRESS_WARNING === 'true',
        type: 'module',
      },
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
      },
      kit: {
        includeVersionFile: true,
      },
      manifest: {
        background_color: '#0F0D11',
        description: 'Secure boulder topo and session tracker.',
        display: 'standalone',
        name: 'grnyte',
        scope: '/',
        // Icons are injected from pwa-assets.config.ts via the `pwaAssets` option below.
        screenshots: [
          {
            form_factor: 'narrow',
            label: 'The landing page',
            sizes: '1024x2216',
            src: '/screenshot-mobile.jpg',
            type: 'image/jpg',
          },
          {
            form_factor: 'wide',
            label: 'The landing page',
            sizes: '1638x1024',
            src: '/screenshot-desktop.jpg',
            type: 'image/jpg',
          },
        ],
        short_name: 'grnyte',
        start_url: '/explore',
        theme_color: '#8E43B2',
      },
      mode: 'development',
      pwaAssets: {
        config: true,
      },
      scope: '/',
      srcDir: './src',
      strategies: 'injectManifest',
      useCredentials: true,
      workbox: {
        globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
      },
    }).map(unmaskBuildFailure),
    trackServiceWorkerEmit,
  ],
  server: {
    host: true,
    port: 3000,
  },
  test: {
    // Date/Intl assertions must not depend on the machine's timezone (a UTC+13
    // runner would format 2026-04-21T12:00Z as Apr 22 and fail).
    env: { TZ: 'UTC' },
    // Vitest picks up `**/*.spec.ts` by default, which would otherwise try to run the Playwright
    // spec (`npm run test:e2e` owns that one). `.claude/` holds agent worktrees - whole checkouts
    // of this repo, whose tests would run again against a stale copy of the source.
    exclude: [...configDefaults.exclude, '**/.claude/**', 'e2e/**'],
    // Two projects, because `environment` is resolved per PROJECT and not per file.
    //
    // `environment: 'jsdom'` puts `browser` into Vite's resolve conditions for the whole project,
    // and SvelteKit's `$app/*` packages are exports-mapped on that condition: `$app/paths` then
    // resolves to `paths/client.js`, which touches `window` at import time. A `.remote.ts` module
    // pulls that in transitively, so importing one from a jsdom test dies with
    // `ReferenceError: window is not defined` before a single assertion runs. A per-file
    // `// @vitest-environment node` pragma cannot fix it: the pragma switches the test environment,
    // not the resolve conditions, which are decided once when the project is configured.
    //
    // So remote-function tests get a project whose environment is `node` from the start. Everything
    // else keeps the jsdom project it has always had, unchanged.
    projects: [
      {
        extends: true,
        test: {
          environment: 'jsdom',
          exclude: [...configDefaults.exclude, '**/.claude/**', 'e2e/**', 'src/**/*.remote.test.ts'],
          name: 'browser',
          setupFiles: ['./vitest-setup.js'],
        },
      },
      {
        extends: true,
        // The actual fix, and it is not `environment` alone. SvelteKit resolves `$app/paths` through
        // its own package `imports` map:
        //     "#app/paths": { "browser": "...paths/client.js", "default": "...paths/server.js" }
        // so whether a test gets the client build (which reads `window` at import time) is decided
        // by the `browser` RESOLVE CONDITION, not by the test environment. Listing conditions
        // without `browser` is what routes it to `server.js`.
        resolve: {
          conditions: ['node', 'svelte', 'module', 'import', 'default'],
        },
        test: {
          environment: 'node',
          include: ['src/**/*.remote.test.ts'],
          name: 'server',
          // No `vitest-setup.js`: it only registers jest-dom's DOM matchers, which need a document.
        },
      },
    ],
  },
})
