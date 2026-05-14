import { APP_PERMISSION_ADMIN, checkAppPermission, checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { regions } from '$lib/db/schema'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, params }) => {
  if (
    !(
      checkAppPermission(locals.userPermissions, [APP_PERMISSION_ADMIN]) ||
      checkRegionPermission(locals.userRegions, [REGION_PERMISSION_ADMIN], Number(params.regionId))
    )
  ) {
    error(404)
  }

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const region = await db.query.regions.findFirst({ where: eq(regions.id, Number(params.regionId)) })

    if (region == null) {
      error(404)
    }

    return {
      region,
    }
  })
  // @ts-expect-error fix for missing z
}) satisfies PageServerLoad
