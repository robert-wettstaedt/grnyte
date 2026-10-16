/** The entity whose detail is open, which no narrowing may hide. */
export type OpenEntity = null | { id: number; kind: 'areas' | 'blocks' }

interface NarrowBlock {
  areas: { id: number; name: string }[]
  id: number
  name: string
}

interface NarrowInput<B extends NarrowBlock> {
  blocks: B[]
  filterActive: boolean
  open: OpenEntity
  /** The last result, returned again when this one holds the same blocks. */
  previous?: B[]
  /** Counts of routes the filter keeps, so a block absent here holds none. */
  routeCountByBlock: Map<number, number>
  routes: { blockFk: null | number; name: null | string }[]
  search: string
}

/** The blocks the explore map draws: search and filter narrow, the open entity is always kept. Hands
 *  back `previous` (or `blocks` when nothing narrows) if the set is unchanged, so the layer never flashes. */
export function narrowBlocks<B extends NarrowBlock>(input: NarrowInput<B>): B[] {
  const { blocks, filterActive, open, routeCountByBlock, routes } = input
  const needle = input.search.trim().toLowerCase()
  if (needle.length === 0 && !filterActive) return blocks

  let matched: null | Set<number> = null
  if (needle.length > 0) {
    matched = new Set()
    for (const route of routes) {
      if (route.blockFk != null && route.name?.toLowerCase().includes(needle)) matched.add(route.blockFk)
    }
    for (const block of blocks) {
      if (
        block.name.toLowerCase().includes(needle) ||
        block.areas.some((area) => area.name.toLowerCase().includes(needle))
      ) {
        matched.add(block.id)
      }
    }
  }

  const isOpen = (block: B) =>
    open?.kind === 'blocks'
      ? block.id === open.id
      : open?.kind === 'areas' && block.areas.some((area) => area.id === open.id)

  const result = blocks.filter(
    (block) =>
      isOpen(block) ||
      ((matched == null || matched.has(block.id)) && (!filterActive || routeCountByBlock.has(block.id))),
  )
  const { previous } = input
  const unchanged = previous?.length === result.length && result.every((block, index) => block === previous[index])
  return unchanged ? previous : result
}
