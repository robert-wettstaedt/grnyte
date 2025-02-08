import { sveltekit } from '@sveltejs/kit/vite'
import { svelteTesting } from '@testing-library/svelte/vite'
import type { Plugin } from 'vite'
import { purgeCss } from 'vite-plugin-tailwind-purgecss'
import { defineConfig } from 'vitest/config'
import { config } from './src/lib/config'

const viteServerConfig: Plugin = {
  name: 'cors-middleware',
  configureServer(server) {
    server.middlewares.use((_, res, next) => {
      Object.entries(config.cors.headers).forEach(([key, value]) => res.setHeader(key, value))
      next()
    })
  },
}

export default defineConfig({
  server: {
    host: true,
    port: 3000,
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  plugins: [sveltekit(), svelteTesting(), purgeCss(), viteServerConfig],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest-setup.js'],
  },
})
