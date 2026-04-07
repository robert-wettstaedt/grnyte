import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
import { createContext } from 'svelte'
import type { PageProps } from '../../routes/(app)/areas/[...slugs]/$types'

export interface AreaContext {
  area: ZeroQueryResult<PageProps['data']['areaQuery']>
}

export const [getAreaContext, setAreaContext] = createContext<AreaContext>()
