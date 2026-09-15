import type { StorybookConfig } from '@storybook/sveltekit'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

/**
 * Storybook runs no SvelteKit server, so a `*.remote.ts` module cannot work here. Its
 * `command`/`query` exports are stripped for the client and replaced with RPC stubs by a step
 * that only happens in `vite build`, so left alone rolldown resolves the real module, finds the
 * exports missing and fails the whole preview build (`upload-manager` pulls three of them, which
 * is what broke `build-storybook`). Swap the module for stubs that throw if a story ever calls
 * one, which also keeps the server-only import chain behind them out of the preview bundle.
 */
function stubRemoteFunctions(): Plugin {
  const stubbed = new Map<string, string>()

  return {
    enforce: 'pre',
    load(id) {
      const file = stubbed.get(id)

      if (file == null) {
        return
      }

      const names = [...readFileSync(file, 'utf8').matchAll(/^export const (\w+)/gm)].map(([, name]) => name)
      return [
        "const unavailable = () => { throw new Error('Remote functions do not run in Storybook') }",
        ...names.map((name) => `export const ${name} = unavailable`),
      ].join('\n')
    },
    name: 'grnyte-stub-remote-functions',
    async resolveId(source, importer, options) {
      if (!source.includes('.remote')) {
        return
      }

      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })

      if (resolved == null || !/\.remote\.(js|ts)$/.test(resolved.id)) {
        return
      }

      const id = `\0grnyte-remote-stub:${resolved.id.replace(/[/.]/g, '_')}`
      stubbed.set(id, resolved.id)
      return id
    },
  }
}

const config: StorybookConfig = {
  addons: ['@storybook/addon-svelte-csf', '@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: '@storybook/sveltekit',
  // Serve story image fixtures where the app's `/image/` route would be, so the
  // Topo story's <Image> resolves without the SvelteKit server route.
  staticDirs: [{ from: './fixtures', to: '/image' }],
  stories: ['../src/**/*.stories.@(js|ts|svelte)'],
  viteFinal: (viteConfig) => {
    viteConfig.plugins = [stubRemoteFunctions(), ...(viteConfig.plugins ?? [])]
    return viteConfig
  },
}
export default config
