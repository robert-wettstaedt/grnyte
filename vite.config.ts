import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { svelteTesting } from '@testing-library/svelte/vite'
import { SvelteKitPWA } from '@vite-pwa/sveltekit'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const file = fileURLToPath(new URL('package.json', import.meta.url))
const json = readFileSync(file, 'utf8')
const pkg = JSON.parse(json)

export default defineConfig({
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
    SvelteKitPWA({
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
    }),
  ],
  server: {
    host: true,
    port: 3000,
  },
  test: {
    // Date/Intl assertions must not depend on the machine's timezone (a UTC+13
    // runner would format 2026-04-21T12:00Z as Apr 22 and fail).
    env: { TZ: 'UTC' },
    environment: 'jsdom',
    setupFiles: ['./vitest-setup.js'],
  },
})
