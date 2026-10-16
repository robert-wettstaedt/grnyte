import { describe, expect, it } from 'vitest'
import { narrowBlocks, type OpenEntity } from './narrow'

const FOREST = { id: 10, name: 'Forest' }
const SECTOR = { id: 20, name: 'Wall' }
const blocks = [
  { areas: [FOREST, SECTOR], id: 1, name: 'Egg' },
  { areas: [FOREST], id: 2, name: 'Cube' },
  { areas: [{ id: 30, name: 'Meadow' }], id: 3, name: 'Slab' },
]
const routes = [
  { blockFk: 1, name: 'Rubber Gun' },
  { blockFk: 2, name: 'Crimp Line' },
  { blockFk: 3, name: null },
]

const ids = (search: string, open: OpenEntity = null, filtered?: number[]) =>
  narrowBlocks({
    blocks,
    filterActive: filtered != null,
    open,
    routeCountByBlock: new Map((filtered ?? []).map((id) => [id, 1])),
    routes,
    search,
  }).map((block) => block.id)

describe('narrowBlocks', () => {
  it('returns the source array when nothing narrows', () => {
    const input = { blocks, filterActive: false, open: null, routeCountByBlock: new Map(), routes, search: ' ' }
    expect(narrowBlocks(input)).toBe(blocks)
  })

  it('hands back the previous result when the drawn set is unchanged', () => {
    const input = { blocks, filterActive: false, open: null, routeCountByBlock: new Map(), routes, search: 'forest' }
    const first = narrowBlocks(input)
    expect(narrowBlocks({ ...input, open: { id: 2, kind: 'blocks' }, previous: first })).toBe(first)
    expect(narrowBlocks({ ...input, open: { id: 3, kind: 'blocks' }, previous: first })).not.toBe(first)
  })

  it('matches a route name whose block and areas do not', () => {
    expect(ids('rubber')).toEqual([1])
  })

  it('matches a block name or an enclosing area name', () => {
    expect(ids('cube')).toEqual([2])
    expect(ids('forest')).toEqual([1, 2])
  })

  it('composes search with the route filter', () => {
    expect(ids('forest', null, [2, 3])).toEqual([2])
  })

  it('keeps the open block whatever the search excludes', () => {
    expect(ids('rubber', { id: 3, kind: 'blocks' })).toEqual([1, 3])
  })

  it('keeps the open block whatever the filter excludes', () => {
    expect(ids('', { id: 1, kind: 'blocks' }, [3])).toEqual([1, 3])
  })

  it("keeps an open area's whole subtree", () => {
    expect(ids('slab', { id: 10, kind: 'areas' })).toEqual([1, 2, 3])
  })
})
