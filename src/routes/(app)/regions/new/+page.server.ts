import { listOwnedRegions } from '$lib/entities/region/create.server'
import type { PageServerLoad } from './$types'

/**
 * What the screen cannot work out for itself.
 *
 * **The one server load under `(app)`, and it has to stay the only one.** The group is `ssr = false`
 * and `src/sw.ts` answers an offline navigation with the prerendered shell, but Kit's client router
 * still fetches `__data.json` on first entry to any route that has a server load. Offline that fetch
 * rejects and the router falls through to `+error.svelte` instead of the page. This screen gets away
 * with it because creating a region needs a server anyway, so the offline error state is the honest
 * answer here. A *read* screen that gained one would fail the same way, silently, with no build
 * error and nothing in the diff to suggest it.
 *
 * `regions.created_by` is not something the client syncs (Zero carries memberships, and being a
 * member is not the same as having founded it), and the session's address lives on `locals`
 * rather than on the `public.users` row. Both are read once, here, rather than turned into remote
 * queries: this is the only screen that asks.
 */
export const load = (async ({ locals }) => ({
  email: locals.claims?.email,
  owned: locals.user == null ? [] : await listOwnedRegions(locals.user.id),
})) satisfies PageServerLoad
