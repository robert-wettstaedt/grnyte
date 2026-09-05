import type { Preview } from '@storybook/sveltekit'
import GlobalStateDecorator from './GlobalStateDecorator.svelte'
import LocaleDecorator from './LocaleDecorator.svelte'
import WidthDecorator from './WidthDecorator.svelte'
// Pull in the real app stylesheet (Tailwind 4 + Skeleton + grnyte tokens) so
// components render exactly as they do in the app.
import '../src/app.css'
// And the markdown stylesheet, which the app loads from its root layout rather than from
// `Markdown.svelte` (one document, one `<link>`). The preview runs no layout, so a story that
// renders a description or a comment would otherwise show unstyled markdown. Dark only, to match
// the theme forced below.
import 'github-markdown-css/github-markdown-dark.css'

// The app runs under `<html class="dark" data-theme="grnyte">` (see src/app.html).
// Replicate that on the preview iframe so theme tokens and dark mode resolve.
if (typeof document !== 'undefined') {
  document.documentElement.classList.add('dark')
  document.documentElement.setAttribute('data-theme', 'grnyte')
}

const preview: Preview = {
  decorators: [
    // Sizes the canvas for stories that set `parameters.width`; a no-op for the rest.
    (story, context) => ({ Component: WidthDecorator, props: { width: context.parameters.width } }),
    // getGlobalState() context; `parameters.globalState` adds a user and region permissions.
    (story, context) => ({ Component: GlobalStateDecorator, props: { state: context.parameters.globalState } }),
    // Renders every story in the locale picked from the toolbar.
    (story, context) => ({ Component: LocaleDecorator, props: { locale: context.globals.locale } }),
  ],
  globalTypes: {
    locale: {
      description: 'Message locale',
      toolbar: {
        icon: 'globe',
        items: [
          { title: 'English', value: 'en' },
          { title: 'Deutsch', value: 'de' },
        ],
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: 'root' },
    locale: 'en',
  },
  parameters: {
    backgrounds: {
      // The theme tokens themselves, not copies of them: app.css is loaded above, so the two
      // canvases track the surface ramp instead of drifting from it.
      options: {
        card: { name: 'Surface card', value: 'var(--color-surface-900)' },
        root: { name: 'Surface root', value: 'var(--color-surface-950)' },
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'centered',
  },
}

export default preview
