import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toFirstAscensionist } from './mapper'

/**
 * All first ascensionists in the user's regions, ordered by name. Reads from
 * the preloaded `firstAscensionists` table, so this resolves from local data.
 */
export function firstAscensionistList() {
  return createResource(
    () => queries.listFirstAscensionists(),
    (rows) => rows.map(toFirstAscensionist),
  )
}
