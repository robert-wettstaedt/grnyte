import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
import type { queries } from '$lib/db/zero'
import { createContext } from 'svelte'

type Queries = typeof queries

export interface TopoContext {
  topo: ZeroQueryResult<ReturnType<Queries['topo']>>
}

export const [getTopoContext, setTopoContext] = createContext<TopoContext>()
