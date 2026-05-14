import { command, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import * as schema from '$lib/db/schema'
import { enhance, type Action } from '$lib/forms/enhance.server'
import { error } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import z from 'zod'

const actionSchema = z.object({
  areaId: z.number(),
  blockIds: z.array(z.number()),
})
type ActionSchema = z.infer<typeof actionSchema>

export const updateBlockOrder = command(actionSchema, (arg) => enhance(arg, updateBlockOrderAction))

const updateBlockOrderAction: Action<ActionSchema> = async ({ areaId, blockIds }, db) => {
  const { locals } = getRequestEvent()

  const area = await db.query.areas.findFirst({
    where: (table, { eq }) => eq(table.id, Number(areaId)),
  })

  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], area?.regionFk)) {
    error(404)
  }

  const blocks = await db.query.blocks.findMany({
    where: (table, { eq }) => eq(table.areaFk, areaId),
  })

  try {
    await Promise.all(
      blockIds.map((id, index) => {
        const block = blocks.find((block) => block.id === id)
        const name = block?.name.replace(/^Block\s\d+/, `Block ${index + 1}`)
        const slug = name == null ? undefined : schema.generateSlug(name)

        return db
          .update(schema.blocks)
          .set({ order: index, name, slug })
          .where(and(eq(schema.blocks.areaFk, areaId), eq(schema.blocks.id, id)))
      }),
    )
    console.log('done')
  } catch (error) {
    console.log(error)
  }
}
