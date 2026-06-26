import type { PageServerLoad } from './$types'

/**
 * Tells the landing page whether the visitor is signed in, so the header CTA can
 * render the right target/label during SSR. Scoped to this page (not the root),
 * so the CSR-only (app) group keeps zero server-load deps and stays offline-safe.
 * `locals.session` is populated by the authGuard hook (src/lib/hooks/auth.server.ts).
 */
export const load = (({ locals }) => {
  return { signedIn: locals.session != null }
}) satisfies PageServerLoad
