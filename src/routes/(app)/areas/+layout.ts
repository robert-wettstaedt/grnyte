import type { LayoutLoad } from './$types'

// Everything under /areas is a focused, full-screen editor (add/edit/export/…)
// rather than a primary destination, so the app shell hides its nav chrome on
// these routes. The flag is read in (app)/+layout.svelte.
export const load: LayoutLoad = () => ({ fullscreen: true })
