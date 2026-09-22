import { query } from '$app/server'
import { APP_PERMISSION_ADMIN } from '$lib/auth'
import { pinnedTx } from '$lib/db/pinned.server'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { getLocale } from '$lib/paraglide/runtime'
import { authedRls } from '$lib/remote/authed.server'
import { requireAppAdmin } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { canReadRegion } from './permissions'
import type { RegionStats, RegionSummary } from './stats'
import { collectRegionStats, collectRegionSummaries } from './stats.server'

/**
 * A region's numbers. Members read their own region under RLS; an app admin reads any region
 * through the privileged handle, counts only and never content. That branch has no RLS underneath
 * it: this check is the gate, not defence in depth.
 *
 * `authedRls` rather than `authedQuery`: the latter holds a pool slot for the whole handler, and
 * the privileged branch then takes several more from the same three-slot pool. Either branch opens
 * a transaction, and only for as long as its own reads take.
 */
export const regionStats = query(z.object({ regionFk: z.number() }), async ({ regionFk }): Promise<RegionStats> => {
  const { rls, userPermissions, userRegions } = await authedRls()
  const locale = getLocale()
  const now = new Date()

  const isMember = canReadRegion(userRegions, regionFk)
  if (!isMember && !userPermissions?.includes(APP_PERMISSION_ADMIN)) {
    error(403, formError('form_noPermission'))
  }

  // The member path stays under RLS, so a bug in the gate above cannot reach another region.
  const stats = isMember
    ? await rls((tx) => collectRegionStats(tx, regionFk, locale, now))
    : await pinnedTx((tx) => collectRegionStats(tx, regionFk, locale, now))

  if (stats == null) {
    error(404, formError('region_notFound'))
  }

  return stats
})

/** Every region, for the app-admin list. No member fallback: a member reaches their own via Zero.
 *  On the privileged handle, like `listFeedback`, and pinned, so it holds one of three pool
 *  slots for a BEGIN, the probe, the read and a COMMIT. Keep the read the only thing in it. */
export const listAllRegions = query(async (): Promise<RegionSummary[]> => {
  const { userPermissions } = await authedRls()

  requireAppAdmin(userPermissions)

  return pinnedTx((tx) => collectRegionSummaries(tx, getLocale()))
})
