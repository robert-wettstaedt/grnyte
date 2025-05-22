import { getLayoutBlocks } from '$lib/blocks.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import type { InferResultType } from '$lib/db/types'
import { error, json } from '@sveltejs/kit'

export const GET = async ({ locals }) => {
  if (locals.userRegions.length === 0) {
    error(404)
  }

  const localDb = await createDrizzleSupabaseClient(locals.supabase)
  const { blocks, parkingLocations, walkingPaths } = await localDb(async (db) => {
    const blocks = await getLayoutBlocks(db)

    const data = blocks.flatMap((block) => {
      let current = block.area as InferResultType<'areas', { parent: true; parkingLocations: true }> | null
      const parkingLocations = current?.parkingLocations ?? []
      const walkingPaths = current?.walkingPaths ?? []

      while (current?.parent != null) {
        current = current.parent as InferResultType<'areas', { parent: true; parkingLocations: true }> | null
        parkingLocations.push(...(current?.parkingLocations ?? []))
        walkingPaths.push(...(current?.walkingPaths ?? []))
      }

      return { parkingLocations, walkingPaths }
    })

    const parkingLocations = data.flatMap((item) => item.parkingLocations)
    const walkingPaths = data.flatMap((item) => item.walkingPaths)

    return { blocks, parkingLocations, walkingPaths }
  })

  return json({ blocks, parkingLocations, walkingPaths })
}
