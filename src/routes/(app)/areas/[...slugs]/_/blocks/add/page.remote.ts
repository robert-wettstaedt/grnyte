import { form, getRequestEvent } from '$app/server'
import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { handleFileUpload } from '$lib/components/FileUpload/handle.server'
import { config } from '$lib/config'
import { blocks, generateSlug, topos } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { enhanceForm, type Action } from '$lib/forms/enhance.server'
import { blockActionSchema } from '$lib/forms/schemas'
import { createGeolocationFromFiles } from '$lib/topo-files.server'
import { error } from '@sveltejs/kit'
import { count, eq } from 'drizzle-orm'
import z from 'zod'

export const createBlock = form((data) => enhanceForm(data, createBlockActionSchema, createBlockAction))

const createBlockAction: Action<CreateBlockActionValues> = async (values, db, user) => {
  const { locals } = getRequestEvent()

  const slug = generateSlug(values.name)

  const area = await db.query.areas.findFirst({
    where: (table, { eq }) => eq(table.id, values.areaId),
    columns: { regionFk: true, name: true },
  })

  if (area == null || !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)) {
    error(404)
  }

  // Check if a block with the same slug already exists in the area
  const existingBlocksResult = await db.query.blocks.findFirst({
    where: (table, { and, eq }) => and(eq(table.slug, slug), eq(table.areaFk, values.areaId)),
  })

  if (existingBlocksResult != null) {
    // If a block with the same slug exists, return a 400 error with a message
    error(400, `Block with name "${existingBlocksResult.name}" already exists in area "${area.name}"`)
  }

  const [blocksCount] = await db.select({ count: count() }).from(blocks).where(eq(blocks.areaFk, values.areaId))

  // Insert the new block into the database
  const [block] = await db
    .insert(blocks)
    .values({
      ...values,
      createdBy: user.id,
      areaFk: values.areaId,
      order: blocksCount.count,
      regionFk: area.regionFk,
      slug,
    })
    .returning()

  await insertActivity(db, {
    type: 'created',
    userFk: user.id,
    entityId: String(block.id),
    entityType: 'block',
    parentEntityId: String(values.areaId),
    parentEntityType: 'area',
    regionFk: block.regionFk,
  })

  if (values.folderName != null && block != null) {
    try {
      const results = await handleFileUpload(
        db,
        locals.supabase,
        values.folderName!,
        config.files.folders.topos,
        { blockFk: block.id, regionFk: block.regionFk },
        values.bunnyVideoIds,
      )

      const fileBuffers = results.map((result) => result.fileBuffer).filter((buffer) => buffer != null)

      await createGeolocationFromFiles(db, block, fileBuffers)
      await Promise.all(
        results.map((result) =>
          db.insert(topos).values({ blockFk: block.id, fileFk: result.file.id, regionFk: area.regionFk }),
        ),
      )
    } catch (exception) {
      error(
        400,
        `The block was successfully created but an error occurred while creating topos: ${convertException(exception)}`,
      )
    }
  }

  // Redirect to the newly created block's page
  return ['', 'blocks', block.id].join('/')
}

type CreateBlockActionValues = z.infer<typeof createBlockActionSchema>
const createBlockActionSchema = z.intersection(
  z.object({
    areaId: z.number(),
  }),
  blockActionSchema,
)
