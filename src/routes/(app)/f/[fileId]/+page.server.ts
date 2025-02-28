import { db } from '$lib/db/db.server'
import { eq } from 'drizzle-orm'
import { files } from '$lib/db/schema'
import { loadFiles } from '$lib/nextcloud/nextcloud.server.js'
import { error } from '@sveltejs/kit'
import { convertMarkdownToHtml } from '$lib/markdown.js'

export const load = async ({ locals, params }) => {
  const { fileId } = params

  const file = await db.query.files.findFirst({
    where: eq(files.id, fileId),
    with: {
      ascent: {
        with: {
          author: true,
          route: true,
        },
      },
    },
  })

  if (file == null || file.bunnyStreamFk == null) {
    error(404)
  }

  if (file.visibility !== 'public' && !locals.user) {
    error(404)
  }

  const [fileDTO] = await loadFiles([file])
  const notes = file.ascent == null ? null : await convertMarkdownToHtml(file.ascent.notes, db)

  return {
    file: { ...fileDTO, ...file },
    notes,
  }
}
