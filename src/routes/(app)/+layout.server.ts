import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { migrateTopoPercentages } from '$lib/db/scripts/migrate-topo-percentages'

export const load = async ({ locals }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    await migrateTopoPercentages(db)
  })
}
