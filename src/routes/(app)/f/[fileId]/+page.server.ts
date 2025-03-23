import { db } from '$lib/db/db.server'
import { files } from '$lib/db/schema'
import { convertMarkdownToHtml } from '$lib/markdown'
import { loadFiles } from '$lib/nextcloud/nextcloud.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'

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
