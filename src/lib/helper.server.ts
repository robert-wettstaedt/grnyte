import { BUNNY_STREAM_API_KEY } from '$env/static/private'
import { PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'
import { deleteVideo } from '$lib/bunny'
import * as schema from '$lib/db/schema'
import { MAX_AREA_NESTING_DEPTH } from '$lib/db/utils'
import { fileLogger } from '$lib/logging'
import { deleteFile } from '$lib/nextcloud/nextcloud.server'
import { error } from '@sveltejs/kit'
import { and, eq, inArray, SQL } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

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
  const start = Date.now()

  fileLogger.info('File deletion started', {
    options: opts,
    hasFileId: !!opts.fileId,
    hasAreaFk: !!opts.areaFk,
    hasAscentFk: !!opts.ascentFk,
    hasBlockFk: !!opts.blockFk,
    hasRouteFk: !!opts.routeFk,
  })

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
    fileLogger.error('File deletion failed - insufficient parameters', { options: opts })
    throw new Error('Not enough parameters to delete files')
  }

  try {
    const filesToDelete = await db.query.files.findMany({ where: and(...where) })
    const fileIds = filesToDelete.map((file) => file.id)

    if (filesToDelete.length === 0) {
      fileLogger.debug('No files found to delete', { options: opts })
      return
    }

    fileLogger.debug('Files found for deletion', {
      filesCount: filesToDelete.length,
      fileIds: fileIds.slice(0, 10), // Log first 10 IDs to avoid spam
      totalFileIds: fileIds.length,
    })

    const bunnyStreamsToDelete = await db.query.bunnyStreams.findMany({
      where: inArray(schema.bunnyStreams.fileFk, fileIds),
    })

    if (bunnyStreamsToDelete.length > 0) {
      const bunnyStreamIds = bunnyStreamsToDelete.map((stream) => stream.id)
      await db.delete(schema.bunnyStreams).where(inArray(schema.bunnyStreams.id, bunnyStreamIds))

      fileLogger.debug('Bunny streams deleted from database', {
        streamsCount: bunnyStreamsToDelete.length,
      })
    }

    if (fileIds.length > 0) {
      await db.delete(schema.files).where(inArray(schema.files.id, fileIds))

      fileLogger.debug('Files deleted from database', {
        filesCount: fileIds.length,
      })
    }

    // Delete files from storage
    const storageDeleteStart = Date.now()
    await Promise.all(filesToDelete.map((file) => deleteFile(file)))
    const storageDeleteTime = Date.now() - storageDeleteStart

    // Delete videos from Bunny Stream
    const videoDeleteStart = Date.now()
    await Promise.all(
      bunnyStreamsToDelete.map((bunnyStream) =>
        deleteVideo({
          apiKey: BUNNY_STREAM_API_KEY,
          libraryId: PUBLIC_BUNNY_STREAM_LIBRARY_ID,
          videoId: bunnyStream.id,
        }),
      ),
    )
    const videoDeleteTime = Date.now() - videoDeleteStart

    const totalTime = Date.now() - start

    fileLogger.info('File deletion completed successfully', {
      options: opts,
      filesDeleted: filesToDelete.length,
      bunnyStreamsDeleted: bunnyStreamsToDelete.length,
      totalTime,
      storageDeleteTime,
      videoDeleteTime,
    })
  } catch (error) {
    const totalTime = Date.now() - start

    fileLogger.error('File deletion failed', {
      options: opts,
      totalTime,
      error,
    })

    throw error
  }
}

export async function getUserPermissions(
  db: PostgresJsDatabase<typeof schema>,
  authUserId: string,
): Promise<App.SafeSession> {
  const userRole = await db.query.userRoles.findFirst({
    where: (table, { eq }) => eq(table.authUserFk, authUserId),
  })

  const userRegions = await db.query.regionMembers.findMany({
    where: (table, { and, eq, isNotNull }) => and(eq(table.authUserFk, authUserId), isNotNull(table.isActive)),
    columns: {
      regionFk: true,
      role: true,
    },
    with: {
      region: {
        columns: {
          name: true,
          settings: true,
        },
      },
    },
  })

  const permissions = await db.query.rolePermissions.findMany()

  const userPermissions =
    userRole == null
      ? undefined
      : permissions.filter((permission) => permission.role === userRole.role).map(({ permission }) => permission)

  const userRegionsResult = userRegions.map((member) => ({
    ...member,
    permissions: permissions.filter(({ role }) => role === member.role).map(({ permission }) => permission),
    name: member.region.name,
    settings: member.region.settings,
  }))

  return {
    userRole: userRole?.role,
    userRegions: userRegionsResult,
    userPermissions,
    user: undefined,
    session: undefined,
  }
}

export async function getPageState(
  db: PostgresJsDatabase<typeof schema>,
  authUserId: string,
): Promise<App.SafeSession> {
  const user = await db.query.users.findFirst({
    where: (table, { eq }) => eq(table.authUserFk, authUserId),
    with: {
      userSettings: {
        columns: {
          gradingScale: true,
          notifyModerations: true,
          notifyNewAscents: true,
          notifyNewUsers: true,
        },
      },
    },
  })

  return {
    ...(await getUserPermissions(db, authUserId)),
    session: undefined,
    user,
  }
}
