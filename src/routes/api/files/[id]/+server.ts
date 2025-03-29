import { DELETE_PERMISSION, EDIT_PERMISSION } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { deleteFiles } from '$lib/helper.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { z } from 'zod'
import type { RequestEvent } from './$types'

const updateFileSchema = z.object({
  visibility: z.enum(schema.areaVisibilityEnum),
})

const getFile = async ({ locals, params }: RequestEvent, db: PostgresJsDatabase<typeof schema>) => {
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
    ((!locals.userPermissions?.includes(EDIT_PERMISSION) || !locals.userPermissions?.includes(DELETE_PERMISSION)) &&
      authorId !== locals.user.id)
  ) {
    error(404)
  }

  return file
}

export async function PUT(event) {
  const { locals, request } = event
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const { visibility } = updateFileSchema.parse(await request.json())

    const file = await getFile(event, db)
    const [updatedFile] = await db
      .update(schema.files)
      .set({ visibility })
      .where(eq(schema.files.id, file.id))
      .returning()

    return new Response(JSON.stringify(updatedFile), { status: 200 })
  })
}

export async function DELETE(event) {
  const { locals } = event
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const file = await getFile(event, db)
    await deleteFiles({ fileId: file.id }, db)

    const entityId = file.routeFk ?? file.ascentFk ?? file.blockFk ?? file.areaFk
    const entityType =
      file.routeFk != null ? 'route' : file.ascentFk != null ? 'ascent' : file.blockFk != null ? 'block' : 'area'

    if (entityId != null && locals.user != null) {
      await insertActivity(db, {
        type: 'deleted',
        userFk: locals.user.id,
        entityId: String(entityId),
        entityType: entityType,
        columnName: 'file',
      })
    }

    return new Response(null, { status: 200 })
  })
}
