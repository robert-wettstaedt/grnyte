import { resolveInviteState } from '$lib/entities/region/invite.server'
import type { PageServerLoad } from './$types'

/**
 * The whole decision lives in `resolveInviteState`, where the branch order is testable. This reads
 * over the base (non-RLS) `db`, because an anonymous visitor cannot see the row under RLS and the
 * token is what authorizes the read.
 */
export const load = (async ({ locals, url }) => ({
  ...(await resolveInviteState(url.searchParams.get('token'), locals.claims?.email)),

  // Whether there is an app to go back to. A member of some other region reaches this screen only
  // by opening the emailed link, and for them the invitation is an offer, not a gate - so they get
  // a labelled way out. A region-less user deliberately does not: the authGuard bounce is standing
  // in for onboarding, and a dismiss link would only bounce them straight back here. Either way
  // the invitation stays live and reachable from /settings.
  canDismiss: locals.userRegions.length > 0,
})) satisfies PageServerLoad
