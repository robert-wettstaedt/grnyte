import { describe, expect, it } from 'vitest'
import { narrowBlocks, type OpenEntity } from './narrow'

const areas = [
  { description: '', id: 10, name: 'Forest' },
  { description: '', id: 20, name: 'Wall' },
  { description: 'Above the river', id: 30, name: 'Meadow' },
]
const blocks = [
  { areas: [{ id: 10 }, { id: 20 }], description: '', id: 1, name: 'Egg' },
  { areas: [{ id: 10 }], description: 'Sloper start', id: 2, name: 'Cube' },
  { areas: [{ id: 30 }], description: '', id: 3, name: 'Slab' },
]
// What the route search answered for "rubber": block 1 holds "Rubber Gun".
const rubber = new Set([1])

const ids = (search: string, open: OpenEntity = null, filtered?: number[], routeBlocks = new Set<number>()) =>
  narrowBlocks({
    areas,
    blocks,
    filterActive: filtered != null,
    open,
    routeBlocks,
    routeCountByBlock: new Map((filtered ?? []).map((id) => [id, 1])),
    search,
  }).map((block) => block.id)

describe('narrowBlocks', () => {
  const input = { areas, blocks, filterActive: false, open: null, routeBlocks: new Set<number>() }

  it('returns the source array when nothing narrows', () => {
    expect(narrowBlocks({ ...input, routeCountByBlock: new Map(), search: ' ' })).toBe(blocks)
  })

  it('hands back the previous result when the drawn set is unchanged', () => {
    const narrowed = { ...input, routeCountByBlock: new Map(), search: 'forest' }
    const first = narrowBlocks(narrowed)
    expect(narrowBlocks({ ...narrowed, open: { id: 2, kind: 'blocks' }, previous: first })).toBe(first)
    expect(narrowBlocks({ ...narrowed, open: { id: 3, kind: 'blocks' }, previous: first })).not.toBe(first)
  })

  it('keeps the blocks the route search found, whose block and areas do not match', () => {
    expect(ids('rubber', null, undefined, rubber)).toEqual([1])
  })

  it('matches a block or an enclosing area by name or description', () => {
    expect(ids('cube')).toEqual([2])
    expect(ids('forest')).toEqual([1, 2])
    expect(ids('sloper')).toEqual([2])
    expect(ids('river')).toEqual([3])
  })

  it('composes search with the route filter', () => {
    expect(ids('forest', null, [2, 3])).toEqual([2])
  })

  it('keeps the open block whatever the search excludes', () => {
    expect(ids('rubber', { id: 3, kind: 'blocks' }, undefined, rubber)).toEqual([1, 3])
  })

  it('keeps the open block whatever the filter excludes', () => {
    expect(ids('', { id: 1, kind: 'blocks' }, [3])).toEqual([1, 3])
  })

  it("keeps an open area's whole subtree", () => {
    expect(ids('slab', { id: 10, kind: 'areas' })).toEqual([1, 2, 3])
  })
})
