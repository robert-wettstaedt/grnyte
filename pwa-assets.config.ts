import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  // Source lives in static/ so SvelteKit serves the generated icons from the web root.
  images: 'static/logo.svg',
  preset: minimal2023Preset,
})
