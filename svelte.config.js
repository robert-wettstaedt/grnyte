import adapterAuto from '@sveltejs/adapter-auto'
import adapterNode from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  extensions: ['.svelte'],
  kit: {
    // adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
    // If your environment is not supported or you settled on a specific environment, switch out the adapter.
    // See https://kit.svelte.dev/docs/adapters for more information about adapters.
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

  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: [vitePreprocess()],
  vitePlugin: {
    inspector: false,
  },
}
export default config
