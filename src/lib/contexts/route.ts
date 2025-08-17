import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
import { getContext, setContext } from 'svelte'
import type { PageProps } from '../../routes/(app)/areas/[...slugs]/_/blocks/[blockSlug]/routes/[routeSlug]/$types'

export interface RouteContext {
  block: ZeroQueryResult<PageProps['data']['routeQuery']>
  route: ZeroQueryResult<PageProps['data']['routeQuery']>['routes'][0]
}

const key = 'routeContext'

export function setRouteContext(data: RouteContext) {
  setContext(key, () => data)
}

export function getRouteContext() {
  return getContext<() => RouteContext>(key)()
}
