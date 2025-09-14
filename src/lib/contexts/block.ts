import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
import { getContext, setContext } from 'svelte'
import type { PageProps } from '../../routes/(app)/areas/[...slugs]/_/blocks/[blockSlug]/$types'

export interface BlockContext {
  block: ZeroQueryResult<PageProps['data']['blockQuery']>
}

const key = 'blockContext'

export function setBlockContext(data: BlockContext) {
  setContext(key, () => data)
}

export function getBlockContext() {
  return getContext<() => BlockContext>(key)()
}
