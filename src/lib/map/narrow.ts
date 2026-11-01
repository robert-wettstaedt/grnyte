/** The entity whose detail is open, which no narrowing may hide. */
export type OpenEntity = null | { id: number; kind: 'areas' | 'blocks' }

interface NarrowBlock {
  areas: { id: number }[]
  description: string
  id: number
  name: string
}

interface NarrowInput<B extends NarrowBlock> {
  /** Every area, so a block in an area whose name or description matches is kept. */
  areas: { description: string; id: number; name: string }[]
  blocks: B[]
  filterActive: boolean
  open: OpenEntity
  /** The last result, returned again when this one holds the same blocks. */
  previous?: B[]
  /** Blocks holding a route the search matches and the filter keeps. */
  routeBlocks: ReadonlySet<number>
  /** Counts of routes the filter keeps, so a block absent here holds none. */
  routeCountByBlock: Map<number, number>
  search: string
}

/** The blocks the explore map draws: search and filter narrow, the open entity is always kept. Hands
 *  back `previous` (or `blocks` when nothing narrows) if the set is unchanged, so the layer never flashes. */
export function narrowBlocks<B extends NarrowBlock>(input: NarrowInput<B>): B[] {
  const { blocks, filterActive, open, routeCountByBlock } = input
  const needle = input.search.trim().toLowerCase()
  if (needle.length === 0 && !filterActive) return blocks

  let matched: null | Set<number> = null
  if (needle.length > 0) {
    // Name or description, as the search dropdown matches.
    const hit = (entity: { description: string; name: string }) =>
      entity.name.toLowerCase().includes(needle) || entity.description.toLowerCase().includes(needle)
    const areas = new Set(input.areas.filter(hit).map((area) => area.id))
    matched = new Set(input.routeBlocks)
    for (const block of blocks) {
      if (hit(block) || block.areas.some((area) => areas.has(area.id))) matched.add(block.id)
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
