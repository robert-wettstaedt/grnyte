/* eslint-disable svelte/prefer-svelte-reactivity -- the params and the id set are built wholesale per
   write and never mutated after, so the new $state.raw value is the reactivity. */
import { FILTER_PARAM_KEYS, parseRouteFilter, type ParsedRouteFilter } from '$lib/map/filter'
import type { QueryPhase } from '$lib/zero/resource.svelte'

// The live text in the explore search bar, shared so the map can filter its
// markers as the user types: independent of the committed `?q=` that the
// /search list reads (that only updates on submit). The bar writes this
// on every keystroke and deliberately keeps it when it unmounts (opening a detail
// route), so the text survives the round trip and the bar restores it on remount;
// the clear (×) button is what resets it.
let query = $state('')

/** The route filter last applied on a screen whose URL carries it, so detail screens keep it too. */
interface LiveRouteFilter {
  parsed: ParsedRouteFilter
  /** Only the filter's own params, in `FILTER_PARAM_KEYS` order, for links back and for equality. */
  search: string
}

/** Reactive live search-bar text (trimmed), or '' when the bar is idle/unmounted. */
export function liveSearchQuery(): { current: string } {
  return {
    get current() {
      return query
    },
  }
}

/** Written by the search bar as it types, and cleared by the detail screens' search chip. */
export function setLiveSearchQuery(value: string) {
  query = value
}

let filter = $state.raw<LiveRouteFilter>({ parsed: parseRouteFilter(new URLSearchParams()), search: '' })

/** Reactive shared route filter. */
export function liveRouteFilter(): { readonly current: LiveRouteFilter } {
  return {
    get current() {
      return filter
    },
  }
}

/** Written from a URL that carries the filter; an equal filter keeps its reference, so the map stays still. */
export function setLiveRouteFilter(params: URLSearchParams) {
  const kept = new URLSearchParams()
  for (const key of FILTER_PARAM_KEYS) for (const value of params.getAll(key)) kept.append(key, value)
  const search = kept.toString()
  if (search !== filter.search) filter = { parsed: parseRouteFilter(kept), search }
}

/** The route ids the active filter keeps (null with no filter), from the map's filtered rows. */
let matching = $state.raw<{ ids: null | Set<number>; phase: QueryPhase }>({ ids: null, phase: { kind: 'loading' } })

/** Reactive matching route ids, for detail screens to report "n of N". */
export function matchingRoutes(): { readonly current: { ids: null | Set<number>; phase: QueryPhase } } {
  return {
    get current() {
      return matching
    },
  }
}

/** Published by the explore layout from its filtered route rows. */
export function setMatchingRoutes(active: boolean, routes: { id: number }[], phase: QueryPhase) {
  matching = { ids: active ? new Set(routes.map((route) => route.id)) : null, phase }
}
