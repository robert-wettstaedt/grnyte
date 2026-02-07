import { query } from '$app/server'
import { BUNNY_STREAM_API_KEY } from '$env/static/private'
import { PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'
import { getVideo, VideoStatus } from '$lib/bunny'
import { enhance, type Action } from '$lib/forms/enhance.server'
import { error } from '@sveltejs/kit'
import z from 'zod'

export const getFileStatus = query(z.string(), (data) => enhance(data, getFileStatusAction))

const getFileStatusAction: Action<string, VideoStatus> = async (fileId, db, user) => {
  const file = await db.query.files.findFirst({ where: (table, { eq }) => eq(table.id, fileId) })

  if (file == null || file.bunnyStreamFk == null || file.visibility !== 'public') {
    error(404)
  }

  try {
    const video = await getVideo({
      apiKey: BUNNY_STREAM_API_KEY,
      libraryId: PUBLIC_BUNNY_STREAM_LIBRARY_ID,
      videoId: file.bunnyStreamFk,
    })

    const status =
      (Object.entries(VideoStatus).find(([key, value]) => value === video.status)?.[0] as VideoStatus | undefined) ??
      VideoStatus.Unknown

    return status
  } catch (exception) {
    error(500)
  }
}
