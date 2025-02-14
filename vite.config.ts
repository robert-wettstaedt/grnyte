import { sveltekit } from '@sveltejs/kit/vite'
import { svelteTesting } from '@testing-library/svelte/vite'
import { SvelteKitPWA } from '@vite-pwa/sveltekit'
import { purgeCss } from 'vite-plugin-tailwind-purgecss'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: {
    host: true,
    port: 3000,
  },
  plugins: [
    sveltekit(),
    svelteTesting(),
    purgeCss(),
    SvelteKitPWA({
      srcDir: './src',
      mode: 'development',
      strategies: 'injectManifest',
      filename: 'sw.ts',
      scope: '/',
      base: '/',
      useCredentials: true,
      selfDestroying: process.env.SELF_DESTROYING_SW === 'true',
      manifest: {
        name: 'grnyte',
        short_name: 'grnyte',
        description: 'Secure boulder topo and session tracker.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#8439A4',
        background_color: '#1E1E2E',
        icons: [
          {
            sizes: '192x192',
            src: '/android-chrome-192x192.png',
            type: 'image/png',
          },
          {
            sizes: '512x512',
            src: '/android-chrome-512x512.png',
            type: 'image/png',
          },
        ],
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
      },
      injectManifest: {
        globPatterns: ['client/**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        rollupFormat: 'iife',
      },
      workbox: {
        globPatterns: ['client/**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
      },
      devOptions: {
        enabled: true,
        suppressWarnings: process.env.SUPPRESS_WARNING === 'true',
        type: 'module',
        navigateFallback: '/',
      },
      kit: {
        includeVersionFile: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest-setup.js'],
  },
})
