import { debouncedQuery } from '$lib/components/EntitySearch/search.svelte'
import { quietly } from '$lib/state/pill.svelte'
import type { RouteListItem } from './dto'
import { routeMapList, routesByIds } from './resources.svelte'
import { similarNames, type SimilarMatch } from './similarNames'

export type SimilarRoute = SimilarMatch & { route: RouteListItem }

interface SimilarRoutesOptions {
  block: () => { areaFk: number; id: number; regionFk: number }
  /** Whether the name field has focus. The first focus starts the read. */
  focused: () => boolean
  name: () => string
}

const SETTLE_MS = 200

export function similarRoutes({ block, focused, name }: SimilarRoutesOptions) {
  let engaged = $state(false)
  // Open while focused, and after a blur until the name typed under focus has settled into the rows.
  let live = $state(false)
  $effect(() => {
    if (!focused()) return
    engaged = true
    live = true
  })

  // Always open: its close clears the term, which would empty the list for a moment on refocus.
  const settled = debouncedQuery(name, SETTLE_MS, () => true)

  const candidates = quietly(() => routeMapList(() => ({ regionFk: block().regionFk }), { enabled: () => engaged }))

  const match = $derived(similarNames(candidates.data, block()))
  const matches = $derived(match(settled()))
  // A string, so the display query only rebuilds when the ids really change.
  const idsKey = $derived(matches.map(({ id }) => id).join(','))

  const routes = quietly(() => routesByIds(() => (idsKey === '' ? [] : idsKey.split(',').map(Number)), { ttl: 'none' }))

  let rows = $state.raw<SimilarRoute[]>([])

  // Not while the form below is in use, so late rows cannot move it. The current rows stay until the
  // next ones arrive whole: a local route row can be there before its block, area, tags and topo.
  $effect(() => {
    if (!live) return

    const loaded = matches.every(({ id }) => routes.data.some((route) => route.id === id))
    const offline = routes.phase.kind === 'partial' || routes.phase.kind === 'unavailable'
    if (!(routes.phase.kind === 'answered' || (offline && loaded)) && matches.length > 0) return

    rows = matches.flatMap((found) => {
      const route = routes.data.find(({ id }) => id === found.id)
      return route == null ? [] : [{ ...found, route }]
    })
    if (!focused() && settled() === name()) live = false
  })

  return {
    get rows() {
      return rows
    },
  }
}
