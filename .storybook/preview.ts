import type { Preview } from '@storybook/sveltekit'

// Pull in the real app stylesheet (Tailwind 4 + Skeleton + grnyte tokens) so
// components render exactly as they do in the app.
import '../src/app.css'

// The app runs under `<html class="dark" data-theme="grnyte">` (see src/app.html).
// Replicate that on the preview iframe so theme tokens and dark mode resolve.
if (typeof document !== 'undefined') {
  document.documentElement.classList.add('dark')
  document.documentElement.setAttribute('data-theme', 'grnyte')
}

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: {
      options: {
        root: { name: 'Surface root', value: 'oklch(0.165 0.008 305)' },
        card: { name: 'Surface card', value: 'oklch(0.215 0.010 305)' },
      },
    },
    initialGlobals: {
      backgrounds: { value: 'root' },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
