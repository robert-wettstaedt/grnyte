import { beforeEach, describe, expect, it } from 'vitest'
import { clearViewed, loadViewed, recordView, VIEWED_KEY } from './recent.svelte'

describe('recordView', () => {
  beforeEach(() => localStorage.clear())

  it('stores newest first', () => {
    recordView({ id: 1, type: 'areas' })
    recordView({ id: 2, type: 'routes' })
    expect(loadViewed()).toEqual([
      { id: 2, type: 'routes' },
      { id: 1, type: 'areas' },
    ])
  })

  it('moves a repeat view back to the top instead of duplicating it', () => {
    recordView({ id: 1, type: 'areas' })
    recordView({ id: 2, type: 'routes' })
    recordView({ id: 1, type: 'areas' })
    expect(loadViewed()).toEqual([
      { id: 1, type: 'areas' },
      { id: 2, type: 'routes' },
    ])
  })

  it('keeps ids of different types apart', () => {
    recordView({ id: 1, type: 'areas' })
    recordView({ id: 1, type: 'blocks' })
    expect(loadViewed()).toHaveLength(2)
  })

  it('caps the list', () => {
    for (const id of [1, 2, 3, 4, 5, 6]) {
      recordView({ id, type: 'routes' })
    }
    expect(loadViewed().map((ref) => ref.id)).toEqual([6, 5, 4, 3, 2, 1].slice(0, 5))
  })
})

describe('loadViewed', () => {
  beforeEach(() => localStorage.clear())

  it('is empty when nothing was stored', () => {
    expect(loadViewed()).toEqual([])
  })

  it('drops entries that are not a known type or a positive id', () => {
    localStorage.setItem(VIEWED_KEY, JSON.stringify(['areas:1', 'ascents:2', 'areas:', 'areas:x', 'nonsense', 7]))
    expect(loadViewed()).toEqual([{ id: 1, type: 'areas' }])
  })

  it('survives a corrupt payload', () => {
    localStorage.setItem(VIEWED_KEY, '{not json')
    expect(loadViewed()).toEqual([])
  })
})

describe('clearViewed', () => {
  beforeEach(() => localStorage.clear())

  it('forgets every stored view', () => {
    recordView({ id: 1, type: 'areas' })
    recordView({ id: 2, type: 'routes' })
    clearViewed()
    expect(loadViewed()).toEqual([])
  })
})
