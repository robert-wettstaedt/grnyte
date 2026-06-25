import adapterAuto from '@sveltejs/adapter-auto'
import adapterNode from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { execSync } from 'node:child_process'

const versionName = (() => {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA
  if (sha) return sha
  try {
    return execSync('git rev-parse HEAD').toString().trim()
  } catch {
    return process.env.npm_package_version ?? 'dev'
  }
})()

/** @type {import('@sveltejs/kit').Config} */
const config = {
  extensions: ['.svelte'],
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: [vitePreprocess()],

  vitePlugin: {
    inspector: false,
  },
  kit: {
    // adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
    // If your environment is not supported or you settled on a specific environment, switch out the adapter.
    // See https://kit.svelte.dev/docs/adapters for more information about adapters.
    adapter: process.env.VERCEL ? adapterAuto() : adapterNode(),
    serviceWorker: {
      register: false,
    },
    files: {
      serviceWorker: 'src/sw.ts',
    },
    version: {
      name: versionName,
    },
    experimental: {
      remoteFunctions: true,
    },
  },
}
export default config
