import { BUNNY_STREAM_API_KEY } from '$env/static/private'
import { PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'
import { createCollection, createVideo, createVideoUploadSignature, getCollections } from '$lib/bunny'
import { z } from 'zod/v4'
import { CreateVideoResponseSchema } from './lib'

export const POST = async ({ locals }) => {
  if (locals.session?.user.id == null) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const expirationTime = new Date().getTime() + 1000 * 60 * 60

  const collections = await getCollections({
    apiKey: BUNNY_STREAM_API_KEY,
    libraryId: PUBLIC_BUNNY_STREAM_LIBRARY_ID,
    search: locals.session.user.id,
  })
  let collection = (collections.items ?? []).find((item) => item.name === locals.session?.user.id)

  if (collection == null) {
    collection = await createCollection({
      apiKey: BUNNY_STREAM_API_KEY,
      libraryId: PUBLIC_BUNNY_STREAM_LIBRARY_ID,
      name: locals.session.user.id,
    })
  }

  const video = await createVideo({
    apiKey: BUNNY_STREAM_API_KEY,
    collectionId: collection.guid,
    libraryId: PUBLIC_BUNNY_STREAM_LIBRARY_ID,
    title: `prepared-${new Date().toISOString()}`,
  })

  if (!video.guid) {
    return new Response(JSON.stringify({ error: 'Video creation failed' }), { status: 500 })
  }

  const signature = await createVideoUploadSignature({
    apiKey: BUNNY_STREAM_API_KEY,
    expirationTime,
    libraryId: PUBLIC_BUNNY_STREAM_LIBRARY_ID,
    videoId: video.guid,
  })

  const response = { expirationTime, signature, video } satisfies z.infer<typeof CreateVideoResponseSchema>

  return new Response(JSON.stringify(response))
}
