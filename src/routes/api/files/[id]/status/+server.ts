import { BUNNY_STREAM_API_KEY } from '$env/static/private'
import { PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'
import { getVideo } from '$lib/bunny'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import { type FileStatusResponse } from './lib'

export const GET = async ({ locals, params }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const file = await db.query.files.findFirst({ where: eq(schema.files.id, params.id) })

    if (file == null || file.bunnyStreamFk == null) {
      error(404)
    }

    if (file.visibility !== 'public' && !locals.user) {
      error(404)
    }

    try {
      const video = await getVideo({
        apiKey: BUNNY_STREAM_API_KEY,
        libraryId: PUBLIC_BUNNY_STREAM_LIBRARY_ID,
        videoId: file.bunnyStreamFk,
      })
      video.status = 2

      const status = {
        status: video.status,
        title: '',
        message: '',
      } satisfies FileStatusResponse

      switch (video.status) {
        case 0:
          status.title = 'Created'
          status.message = 'The video has been created but not yet uploaded.'
          break
        case 1:
          status.title = 'Uploaded'
          status.message = 'The video has been uploaded but not yet processed.'
          break
        case 2:
          status.title = 'Processing'
          status.message = 'The video is being processed. This may take a few minutes.'
          break
        case 3:
          status.title = 'Transcoding'
          status.message = 'The video is being transcoded. This may take a few minutes.'
          break
        case 4:
          status.title = 'Finished'
          status.message = 'The video has been transcoded and is ready to be played.'
          break
        case 5:
          status.title = 'Error'
          status.message = 'The video has encountered an error. Please try again.'
          break
        case 6:
          status.title = 'Upload Failed'
          status.message = 'The video has failed to upload. Please try again.'
          break
        case 7:
          status.title = 'Jit Segmenting'
          status.message = 'The video is being segmented. This may take a few minutes.'
          break
        case 8:
          status.title = 'Jit Playlists Created'
          status.message = 'The video playlists have been created. This may take a few minutes.'
          break
        default:
          status.title = 'Unknown'
          status.message = 'The video status is unknown.'
          break
      }
      return new Response(JSON.stringify(status), { status: 200 })
    } catch (exception) {
      error(500)
    }
  })
}
