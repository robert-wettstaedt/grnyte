import { BUNNY_STREAM_API_KEY } from '$env/static/private'
import { PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'
import { DELETE_PERMISSION, EDIT_PERMISSION } from '$lib/auth'
import { deleteVideo } from '$lib/bunny'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { getUser } from '$lib/helper.server'
import { deleteFile } from '$lib/nextcloud/nextcloud.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { z } from 'zod'
import type { RequestEvent } from './$types'

const updateFileSchema = z.object({
  visibility: z.enum(schema.areaVisibilityEnum),
})

const getFile = async ({ locals, params }: RequestEvent, db: PostgresJsDatabase<typeof schema>) => {
  const user = await getUser(locals.user, db)

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
    user == null ||
    file == null ||
    ((!locals.userPermissions?.includes(EDIT_PERMISSION) || !locals.userPermissions?.includes(DELETE_PERMISSION)) &&
      authorId !== user.id)
  ) {
    error(404)
  }

  return { file, user }
}

export async function PUT(event) {
  const { locals, request } = event
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const { visibility } = updateFileSchema.parse(await request.json())

    const { file } = await getFile(event, db)
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
    const { file, user } = await getFile(event, db)

    const entityId = file.routeFk ?? file.ascentFk ?? file.blockFk ?? file.areaFk
    const entityType =
      file.routeFk != null ? 'route' : file.ascentFk != null ? 'ascent' : file.blockFk != null ? 'block' : 'area'

    if (file.bunnyStreamFk == null) {
      await deleteFile(file)
    } else {
      await db
        .update(schema.files)
        .set({ bunnyStreamFk: null })
        .where(eq(schema.files.bunnyStreamFk, file.bunnyStreamFk))
      await db.delete(schema.bunnyStreams).where(eq(schema.bunnyStreams.id, file.bunnyStreamFk))
      await deleteVideo({
        apiKey: BUNNY_STREAM_API_KEY,
        libraryId: PUBLIC_BUNNY_STREAM_LIBRARY_ID,
        videoId: file.bunnyStreamFk,
      })
    }

    await db.delete(schema.files).where(eq(schema.files.id, file.id))

    if (entityId != null) {
      await db.insert(schema.activities).values({
        type: 'deleted',
        userFk: user.id,
        entityId: String(entityId),
        entityType: entityType,
        columnName: 'file',
      })
    }

    return new Response(null, { status: 200 })
  })
}
