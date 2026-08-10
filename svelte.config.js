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
    // Do not set `version.name` to anything non-deterministic (Date.now(), random). Kit re-imports
    // this file with a cache-busting query for each build pass, so the client and server passes
    // would get different values, and the `__sveltekit_<hash(version)>` global the client bootstrap
    // reads would never match the one the server injects. Kit's own default is stable per process.
  },

  preprocess: [vitePreprocess()],
  vitePlugin: {
    inspector: false,
  },
}
export default config
