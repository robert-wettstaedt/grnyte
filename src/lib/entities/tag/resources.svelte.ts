import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toTag } from './mapper'

export function tagList() {
  return createResource(
    () => queries.listTags(),
    (rows) => rows.map(toTag),
  )
}
