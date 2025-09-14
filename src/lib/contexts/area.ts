import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
import { getContext, setContext } from 'svelte'
import type { PageProps } from '../../routes/(app)/areas/[...slugs]/$types'

export interface AreaContext {
  area: ZeroQueryResult<PageProps['data']['areaQuery']>
}

const key = 'areaContext'

export function setAreaContext(data: AreaContext) {
  setContext(key, () => data)
}

export function getAreaContext() {
  return getContext<() => AreaContext>(key)()
}
