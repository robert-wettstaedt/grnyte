import { command, getRequestEvent } from '$app/server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { areas, generateSlug } from '$lib/db/schema'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import z from 'zod'

/**
 * Creates a sub-area beneath `parentFk` from just a name — everything else
 * (routes, map position, photos) is filled in afterwards on the new area's
 * page. The region is inherited from the parent and the insert runs under the
 * caller's token, so RLS enforces `region.edit` and rejects users without it.
 */
export const createArea = command(
  z.object({
    name: z.string().trim().min(1),
    parentFk: z.number(),
  }),
  async ({ name, parentFk }) => {
    const { locals } = getRequestEvent()
    const user = locals.user

    if (user == null) {
      error(401, 'Not authenticated')
    }

    const db = await createDrizzleSupabaseClient(locals.supabase)

    return db(async (tx) => {
      const parent = await tx.query.areas.findFirst({
        columns: { id: true, regionFk: true, type: true },
        where: eq(areas.id, parentFk),
      })

      if (parent == null) {
        error(404, 'Parent area not found')
      }

      // Sub-areas may only live under an Area (folder); a Crag holds blocks.
      if (parent.type !== 'area') {
        error(400, 'Areas can only be added under an area')
      }

      const [area] = await tx
        .insert(areas)
        .values({
          createdBy: user.id,
          name,
          parentFk: parent.id,
          regionFk: parent.regionFk,
          slug: generateSlug(name),
          type: 'area',
        })
        .returning({ id: areas.id })

      return area
    })
  },
)
