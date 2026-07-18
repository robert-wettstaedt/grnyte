import adapterAuto from '@sveltejs/adapter-auto'
import adapterNode from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  extensions: ['.svelte'],
  kit: {
    adapter: process.env.VERCEL ? adapterAuto() : adapterNode(),
    experimental: {
      remoteFunctions: true,
    },
    files: {
      serviceWorker: 'src/sw.ts',
    },
    paths: {
      relative: false,
    },
    serviceWorker: {
      register: false,
    },
    version: {
      name: Date.now().toString(),
    },
  },

  preprocess: [vitePreprocess()],
  vitePlugin: {
    inspector: false,
  },
}
export default config
