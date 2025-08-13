import { command, getRequestEvent } from '$app/server'
import { BUNNY_STREAM_API_KEY } from '$env/static/private'
import { PUBLIC_BUNNY_STREAM_LIBRARY_ID } from '$env/static/public'
import { createCollection, createVideo, createVideoUploadSignature, getCollections } from '$lib/bunny'
import { error } from '@sveltejs/kit'

export const createBunnyVideo = command(async () => {
  const { locals } = getRequestEvent()

  if (locals.session?.user.id == null) {
    error(401, 'Unauthorized')
  }

  const expirationTimeInMs = new Date().getTime() + 1000 * 60 * 60 // 1 hour
  const expirationTimeInS = Math.floor(expirationTimeInMs / 1000)

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
    error(500, 'Video creation failed')
  }

  const signature = await createVideoUploadSignature({
    apiKey: BUNNY_STREAM_API_KEY,
    expirationTime: expirationTimeInS,
    libraryId: PUBLIC_BUNNY_STREAM_LIBRARY_ID,
    videoId: video.guid,
  })

  const response = {
    expirationTime: expirationTimeInS,
    signature,
    video,
  }

  return response
})
