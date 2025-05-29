import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { updateRegionMember } from '$lib/forms/actions.server'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, params }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const region = await db.query.regions.findFirst({
      where: (table, { eq }) => eq(table.id, Number(params.regionId)),
    })

    const regionMembers = await db.query.regionMembers.findMany({
      where: (table, { eq }) => eq(table.regionFk, Number(params.regionId)),
      with: {
        invitedBy: true,
        user: true,
      },
    })

    if (region == null) {
      error(404)
    }

    return { region, regionMembers }
  })
}) satisfies PageServerLoad

export const actions = {
  updateRegionMember,
}
