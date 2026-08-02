import { listOwnedRegions } from '$lib/entities/region/create.server'
import type { PageServerLoad } from './$types'

/**
 * What the screen cannot work out for itself.
 *
 * `regions.created_by` is not something the client syncs (Zero carries memberships, and being a
 * member is not the same as having founded it), and the session's address lives on `locals`
 * rather than on the `public.users` row. Both are read once, here, rather than turned into remote
 * queries: this is the only screen that asks.
 */
export const load = (async ({ locals }) => ({
  email: locals.session?.user.email,
  owned: locals.user == null ? [] : await listOwnedRegions(locals.user.id),
})) satisfies PageServerLoad
