import { BUNNY_STREAM_API_KEY } from '$env/static/private'
import { PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'
import * as schema from '$lib/db/schema'
import { MAX_AREA_NESTING_DEPTH } from '$lib/db/utils'
import { deleteFile } from '$lib/nextcloud/nextcloud.server'
import { error } from '@sveltejs/kit'
import { and, eq, inArray, SQL } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { deleteVideo } from './bunny'

/**
 * Converts a slug string into an object containing area slug, area ID,
 * a flag indicating if more areas can be added, and the path array.
 *
 * @param {Record<string, string>} params - The parameters containing the slug string.
 * @returns {Object} An object containing areaSlug, areaId, canAddArea, and path.
 * @throws Will throw an error if the last path item is null or if the area ID is not a number.
 */
export const convertAreaSlug = (params: Record<string, string>) => {
  const path = params.slugs.split('/')
  const lastPathItem = path.at(-1)

  if (lastPathItem == null) {
    error(404)
  }

  const slugItems = lastPathItem.split('-')
  const areaSlug = slugItems.slice(0, -1).join('-')
  const areaId = Number(slugItems.at(-1))
  const canAddArea = path.length < MAX_AREA_NESTING_DEPTH

  if (Number.isNaN(areaId)) {
    error(404)
  }

  return {
    areaSlug,
    areaId,
    canAddArea,
    path,
  }
}

export const getRouteDbFilter = (routeParam: string): SQL => {
  return Number.isNaN(Number(routeParam))
    ? eq(schema.routes.slug, routeParam)
    : eq(schema.routes.id, Number(routeParam))
}

interface DeleteFilesOpts extends Partial<Pick<schema.File, 'routeFk' | 'ascentFk' | 'blockFk' | 'areaFk'>> {
  fileId?: schema.File['id'] | null
}

export const deleteFiles = async (opts: DeleteFilesOpts, db: PostgresJsDatabase<typeof schema>) => {
  const where: SQL[] = []
  if (opts.areaFk != null) {
    where.push(eq(schema.files.areaFk, opts.areaFk))
  }
  if (opts.ascentFk != null) {
    where.push(eq(schema.files.ascentFk, opts.ascentFk))
  }
  if (opts.blockFk != null) {
    where.push(eq(schema.files.blockFk, opts.blockFk))
  }
  if (opts.routeFk != null) {
    where.push(eq(schema.files.routeFk, opts.routeFk))
  }
  if (opts.fileId != null) {
    where.push(eq(schema.files.id, opts.fileId))
  }

  if (where.length === 0) {
    throw new Error('Not enough parameters to delete files')
  }

  const filesToDelete = await db
    .update(schema.files)
    .set({ bunnyStreamFk: null })
    .where(and(...where))
    .returning()
  const fileIds = filesToDelete.map((file) => file.id)

  if (filesToDelete.length === 0) {
    return
  }

  const bunnyStreamsToDelete = await db
    .delete(schema.bunnyStreams)
    .where(inArray(schema.bunnyStreams.fileFk, fileIds))
    .returning()

  await db.delete(schema.files).where(inArray(schema.files.id, fileIds))

  await Promise.all(filesToDelete.map((file) => deleteFile(file)))
  await Promise.all(
    bunnyStreamsToDelete.map((bunnyStream) =>
      deleteVideo({
        apiKey: BUNNY_STREAM_API_KEY,
        libraryId: PUBLIC_BUNNY_STREAM_LIBRARY_ID,
        videoId: bunnyStream.id,
      }),
    ),
  )
}
