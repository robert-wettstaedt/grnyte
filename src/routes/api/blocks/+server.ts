import { READ_PERMISSION } from '$lib/auth'
import { getLayoutBlocks } from '$lib/blocks.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import type { InferResultType } from '$lib/db/types'
import { error, json } from '@sveltejs/kit'

export const GET = async ({ locals }) => {
  if (!locals.userPermissions?.includes(READ_PERMISSION)) {
    error(404)
  }

  const localDb = await createDrizzleSupabaseClient(locals.supabase)
  const { blocks, parkingLocations } = await localDb(async (db) => {
    const blocks = locals.userPermissions?.includes(READ_PERMISSION) ? await getLayoutBlocks(db) : []

    const parkingLocations = blocks.flatMap((block) => {
      let current = block.area as InferResultType<'areas', { parent: true; parkingLocations: true }> | null
      const parkingLocations = current?.parkingLocations ?? []

      while (current?.parent != null) {
        current = current.parent as InferResultType<'areas', { parent: true; parkingLocations: true }> | null
        parkingLocations.push(...(current?.parkingLocations ?? []))
      }

      return parkingLocations
    })

    return { blocks, parkingLocations }
  })

  return json({ blocks, parkingLocations })
}
