import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { areas, blocks } from '$lib/db/schema'
import { error } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'

export const PUT = async ({ locals, params, url }) => {
  const { areaId } = params
  const ids = url.searchParams.getAll('id')

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const area = await db.query.areas.findFirst({
      where: eq(areas.id, Number(areaId)),
    })

    if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], area?.regionFk)) {
      error(404)
    }

    await Promise.all(
      ids.map((id, index) =>
        db
          .update(blocks)
          .set({ order: index })
          .where(and(eq(blocks.areaFk, Number(areaId)), eq(blocks.id, Number(id)))),
      ),
    )

    const updatedBlocks = await db.query.blocks.findMany({
      orderBy: [blocks.order, blocks.name],
      where: eq(blocks.areaFk, Number(areaId)),
    })

    return new Response(JSON.stringify({ blocks: updatedBlocks }))
  })
}
