import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
import { createContext } from 'svelte'
import type { PageProps } from '../../routes/(app)/areas/[...slugs]/_/blocks/[blockSlug]/$types'

export interface BlockContext {
  block: ZeroQueryResult<PageProps['data']['blockQuery']>
}

export const [getBlockContext, setBlockContext] = createContext<BlockContext>()
