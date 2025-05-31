import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { imagePreviewHandler, loadFiles } from '$lib/nextcloud/nextcloud.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'

export async function GET(event) {
  const { locals, params } = event

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const block = await db.query.blocks.findFirst({
      where: eq(schema.blocks.id, Number(params.id)),
      with: {
        topos: {
          with: {
            file: true,
          },
        },
      },
    })

    const topo = block?.topos.at(0)

    if (topo?.file == null) {
      error(404, 'Not found')
    }

    const [topoFile] = await loadFiles([topo.file])

    return imagePreviewHandler(topoFile.path, event)
  })
}
