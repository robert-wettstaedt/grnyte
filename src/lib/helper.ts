import { goto } from '$app/navigation'
import { page } from '$app/state'
import { MAX_AREA_NESTING_DEPTH } from '$lib/db/utils.svelte'

/**
 * Converts a slug string into an object containing area slug, area ID,
 * a flag indicating if more areas can be added, and the path array.
 *
 * @throws Will throw an error if the last path item is null or if the area ID is not a number.
 */
export const convertAreaSlug = () => {
  const path = page.params.slugs.split('/').filter(Boolean)

  function strip(item: string | undefined) {
    const slugItems = item?.split('-')
    const slug = slugItems?.slice(0, -1).join('-')
    const id = Number(slugItems?.at(-1))

    return { slug, id: Number.isNaN(id) ? undefined : id }
  }

  const { id: areaId, slug: areaSlug } = strip(path.at(-1))
  const { id: parentId, slug: parentSlug } = strip(path.at(-2))

  if (areaId == null || areaSlug == null) {
    throw new Error('Not found')
  }

  const canAddArea = path.length < MAX_AREA_NESTING_DEPTH

  return {
    areaId,
    areaSlug,
    canAddArea,
    parentId,
    parentSlug,
    path,
  }
}

export async function digestMessage(message: string) {
  const msgUint8 = new TextEncoder().encode(message) // encode as (utf-8) Uint8Array
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8) // hash the message
  const hashArray = Array.from(new Uint8Array(hashBuffer)) // convert buffer to byte array
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('') // convert bytes to hex string
  return hashHex
}
