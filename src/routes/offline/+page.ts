// Prerendered to a static HTML file so the service worker can cache it and serve it as the boot
// shell for any navigation during an offline cold start.
export const prerender = true

// No server rendering, which is what makes it usable as a shell for *other* routes. With SSR on,
// the prerendered file carries this page's own markup and hydration payload, and serving it in
// answer to `/routes/123` boots SvelteKit against data for the wrong route. With SSR off it is an
// empty document that the client router fills in from `location`, so the requested page renders
// directly instead of via a redirect handoff.
export const ssr = false
