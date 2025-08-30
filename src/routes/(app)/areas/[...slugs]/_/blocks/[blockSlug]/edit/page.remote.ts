import { command, form, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
import { createUpdateActivity, insertActivity } from '$lib/components/ActivityFeed/load.server'
import { blocks, generateSlug, geolocations, topoRoutes, topos } from '$lib/db/schema'
import { buildNestedAreaQuery } from '$lib/db/utils'
import { blockWithPathname } from '$lib/db/utils.svelte'
import type { RowWithRelations } from '$lib/db/zero'
import { enhance, enhanceForm, type Action } from '$lib/forms/enhance.server'
import { blockActionSchema } from '$lib/forms/schemas'
import { deleteFiles } from '$lib/helper.server'
import { getReferences } from '$lib/references.server'
import { error } from '@sveltejs/kit'
import { eq, inArray } from 'drizzle-orm'
import z from 'zod'

export const updateBlock = form((data) => enhanceForm(data, editBlockActionSchema, updateBlockAction))

export const deleteBlock = command(z.number(), (id) => enhance(id, deleteBlockAction))

const updateBlockAction: Action<EditBlockActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()
  const { blockId, bunnyVideoIds, folderName, ...entity } = values

  const block = await db.query.blocks.findFirst({
    where: (table, { eq }) => eq(table.id, blockId),
    with: { area: buildNestedAreaQuery() },
  })

  if (block == null) {
    error(404)
  }

  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)) {
    error(401)
  }

  const slug = generateSlug(entity.name)

  // Check if a block with the same slug already exists in the area
  const existingBlocksResult = await db.query.blocks.findFirst({
    where: (table, { and, eq }) => and(eq(table.slug, slug), eq(table.areaFk, block.areaFk)),
  })

  if (existingBlocksResult != null && existingBlocksResult.id !== block.id) {
    // If a block with the same slug exists, return a 400 error with a message
    error(400, `Block with name "${existingBlocksResult.name}" already exists in area "${block.area.name}"`)
  }

  // Update the block in the database with the validated values
  await db
    .update(blocks)
    .set({ ...entity, slug })
    .where(eq(blocks.id, block.id))

  await createUpdateActivity({
    db,
    entityId: String(block.id),
    entityType: 'block',
    newEntity: entity,
    oldEntity: block,
    userFk: user.id,
    parentEntityId: String(block.areaFk),
    parentEntityType: 'area',
    regionFk: block.regionFk,
  })

  const nested = { ...block, slug } as unknown as RowWithRelations<'blocks', { area: true }>
  const { pathname } = blockWithPathname(nested) ?? {}
  return pathname
}

const deleteBlockAction: Action<number> = async (blockId, db, user) => {
  const { locals } = getRequestEvent()

  const block = await db.query.blocks.findFirst({
    where: (table, { eq }) => eq(table.id, blockId),
    with: {
      routes: true,
    },
  })

  if (block == null) {
    error(404)
  }

  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_DELETE], block.regionFk)) {
    error(401)
  }

  if (block.routes.length > 0) {
    error(400, `${block.name} has ${block.routes.length} routes. Delete routes first.`)
  }

  const references = await getReferences(block.id, 'blocks')
  if (references.areas.length + references.ascents.length + references.routes.length > 0) {
    error(400, 'Block is referenced by other entities. Delete references first.')
  }

  const toposToDelete = await db.query.topos.findMany({ where: (table, { eq }) => eq(table.blockFk, block.id) })
  await db.delete(topoRoutes).where(
    inArray(
      topoRoutes.topoFk,
      toposToDelete.map((topo) => topo.id),
    ),
  )

  await db.delete(topos).where(eq(topos.blockFk, block.id))

  await deleteFiles({ blockFk: block.id }, db)

  await db.update(blocks).set({ geolocationFk: null }).where(eq(blocks.id, block.id))
  await db.delete(geolocations).where(eq(geolocations.blockFk, block.id))

  await db.delete(blocks).where(eq(blocks.id, block.id))

  await insertActivity(db, {
    type: 'deleted',
    userFk: user.id,
    entityId: String(block.id),
    entityType: 'block',
    oldValue: block.name,
    parentEntityId: String(block.areaFk),
    parentEntityType: 'area',
    regionFk: block.regionFk,
  })

  return ['', 'areas', block.areaFk].join('/')
}

type EditBlockActionValues = z.infer<typeof editBlockActionSchema>
const editBlockActionSchema = z.intersection(
  z.object({
    blockId: z.number(),
  }),
  blockActionSchema,
)
