import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toFirstAscensionist } from './mapper'

/**
 * First ascensionists ordered by name: all of the user's regions by default,
 * or one region when `regionFk` is set (e.g. the route form's picker).
 */
export function firstAscensionistList(filter: () => { regionFk?: number } = () => ({})) {
  return createResource(
    () => queries.listFirstAscensionists(filter()),
    (rows) => rows.map(toFirstAscensionist),
  )
}
