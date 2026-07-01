import type { StorybookConfig } from '@storybook/sveltekit'

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|ts|svelte)'],
  // Serve story image fixtures where the app's `/image/` route would be, so the
  // Topo story's <Image> resolves without the SvelteKit server route.
  staticDirs: [{ from: './fixtures', to: '/image' }],
  addons: ['@storybook/addon-svelte-csf', '@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: '@storybook/sveltekit',
}
export default config
