import { imagePreviewHandler } from '$lib/nextcloud/nextcloud.server'

export async function GET(event) {
  return imagePreviewHandler(
    event.params.resourcePath.startsWith('/') ? event.params.resourcePath : `/${event.params.resourcePath}`,
    event,
  )
}
