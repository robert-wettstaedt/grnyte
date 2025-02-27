import { db } from '$lib/db/db.server'
import { eq } from 'drizzle-orm'
import { files } from '$lib/db/schema'
import { loadFiles } from '$lib/nextcloud/nextcloud.server.js'
import { error } from '@sveltejs/kit'

export const load = async ({ params }) => {
  const { fileId } = params

  const file = await db.query.files.findFirst({
    where: eq(files.id, Number(fileId)),
    with: {
      area: true,
      ascent: true,
      block: true,
      route: true,
    },
  })

  if (file == null || file.visibility !== 'public' || file.bunnyStreamFk == null) {
    throw error(404)
  }

  const [fileDTO] = await loadFiles([file])

  return {
    file: { ...fileDTO, ...file },
  }
}
