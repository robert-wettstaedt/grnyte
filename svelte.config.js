import adapterAuto from '@sveltejs/adapter-auto'
import adapterNode from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Required to consume SvelteKit remote-function queries (authedQuery) reactively on the client.
  compilerOptions: {
    experimental: {
      async: true,
    },
  },
  extensions: ['.svelte'],
  kit: {
    adapter: process.env.VERCEL ? adapterAuto() : adapterNode(),
    // Story fixtures (the seeded grade table, the sample route counts) live beside the Storybook
    // config rather than in `$lib`, since nothing the app ships imports them. Stories sit in
    // `src/`, so without this they reach it by counting `../` up to the repo root.
    alias: {
      '$storybook/*': '.storybook/*',
    },
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
