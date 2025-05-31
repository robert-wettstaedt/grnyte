import { checkRegionPermission, REGION_PERMISSION_ADMIN, type RegionPermission } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { deleteFiles } from '$lib/helper.server'
import { fileLogger } from '$lib/logging'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { z } from 'zod/v4'
import type { RequestEvent } from './$types'

const updateFileSchema = z.object({
  visibility: z.enum(schema.areaVisibilityEnum),
})

const getFile = async (
  { locals, params }: RequestEvent,
  db: PostgresJsDatabase<typeof schema>,
  permission: RegionPermission,
) => {
  fileLogger.debug('File access attempt', {
    fileId: params.id,
    userId: locals.user?.id,
    requiredPermission: permission,
  })

  const file = await db.query.files.findFirst({
    where: eq(schema.files.id, params.id),
    with: {
      area: true,
      ascent: true,
      block: true,
      route: true,
    },
  })

  // Determine the author ID from the file's related entities
  const authorId = file?.area?.createdBy ?? file?.ascent?.createdBy ?? file?.block?.createdBy ?? file?.route?.createdBy

  if (
    locals.user == null ||
    file == null ||
    !checkRegionPermission(locals.userRegions, [permission], file.regionFk) ||
    authorId !== locals.user.id
  ) {
    fileLogger.warn('File access denied', {
      fileId: params.id,
      userId: locals.user?.id,
      requiredPermission: permission,
      fileExists: !!file,
      regionFk: file?.regionFk,
      authorId,
      accessDeniedReason: !locals.user
        ? 'no_user'
        : !file
          ? 'file_not_found'
          : !checkRegionPermission(locals.userRegions, [permission], file.regionFk)
            ? 'insufficient_region_permissions'
            : 'not_author',
    })
    error(404)
  }

  fileLogger.debug('File access granted', {
    fileId: params.id,
    userId: locals.user?.id,
    requiredPermission: permission,
    regionFk: file.regionFk,
    authorId,
  })

  return file
}

export async function PUT(event) {
  const { locals, request } = event
  const start = Date.now()

  fileLogger.info('File update request started', {
    fileId: event.params.id,
    userId: locals.user?.id,
  })

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    try {
      const { visibility } = updateFileSchema.parse(await request.json())

      const file = await getFile(event, db, REGION_PERMISSION_ADMIN)
      const originalVisibility = file.visibility

      const [updatedFile] = await db
        .update(schema.files)
        .set({ visibility })
        .where(eq(schema.files.id, file.id))
        .returning()

      const totalTime = Date.now() - start

      fileLogger.info('File update completed successfully', {
        fileId: event.params.id,
        userId: locals.user?.id,
        totalTime,
        changes: {
          visibility: {
            from: originalVisibility,
            to: visibility,
          },
        },
        regionFk: file.regionFk,
      })

      return new Response(JSON.stringify(updatedFile), { status: 200 })
    } catch (err) {
      const totalTime = Date.now() - start

      fileLogger.error('File update failed', {
        fileId: event.params.id,
        userId: locals.user?.id,
        totalTime,
        error: err,
      })

      throw err
    }
  })
}

export async function DELETE(event) {
  const { locals } = event
  const start = Date.now()

  fileLogger.info('File deletion request started', {
    fileId: event.params.id,
    userId: locals.user?.id,
  })

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    try {
      const file = await getFile(event, db, REGION_PERMISSION_ADMIN)

      const entityId = file.routeFk ?? file.ascentFk ?? file.blockFk ?? file.areaFk
      const entityType =
        file.routeFk != null ? 'route' : file.ascentFk != null ? 'ascent' : file.blockFk != null ? 'block' : 'area'

      await deleteFiles({ fileId: file.id }, db)

      if (entityId != null && locals.user != null) {
        await insertActivity(db, {
          type: 'deleted',
          userFk: locals.user.id,
          entityId: String(entityId),
          entityType: entityType,
          columnName: 'file',
          regionFk: file.regionFk,
        })
      }

      const totalTime = Date.now() - start

      fileLogger.info('File deletion completed successfully', {
        fileId: event.params.id,
        userId: locals.user?.id,
        totalTime,
        fileMetadata: {
          regionFk: file.regionFk,
          entityType,
          entityId,
          originalPath: file.path,
        },
      })

      return new Response(null, { status: 200 })
    } catch (err) {
      const totalTime = Date.now() - start

      fileLogger.error('File deletion failed', {
        fileId: event.params.id,
        userId: locals.user?.id,
        totalTime,
        error: err,
      })

      throw err
    }
  })
}
