import type { RouteListItem } from '$lib/entities/route/dto'
import { describe, expect, it } from 'vitest'
import { sortRoutes } from './sort'

const route = (over: Partial<RouteListItem>): RouteListItem => ({
  blockFk: 0,
  createdAt: undefined,
  description: '',
  firstAscentYear: undefined,
  gradeFk: undefined,
  id: 0,
  name: '',
  rating: 0,
  tags: [],
  userRating: 0,
  ...over,
})

const ids = (routes: RouteListItem[]) => routes.map((r) => r.id)
const noDistance = () => Infinity

describe('sortRoutes', () => {
  it('grade desc puts hardest first, ungraded last', () => {
    const out = sortRoutes(
      [route({ id: 1, gradeFk: 3 }), route({ id: 2 }), route({ id: 3, gradeFk: 7 })],
      'grade',
      'desc',
      noDistance,
    )
    expect(ids(out)).toEqual([3, 1, 2])
  })

  it('name asc is alphabetical', () => {
    const out = sortRoutes([route({ id: 1, name: 'B' }), route({ id: 2, name: 'A' })], 'name', 'asc', noDistance)
    expect(ids(out)).toEqual([2, 1])
  })

  it('rating desc puts best first', () => {
    const out = sortRoutes([route({ id: 1, rating: 1 }), route({ id: 2, rating: 3 })], 'rating', 'desc', noDistance)
    expect(ids(out)).toEqual([2, 1])
  })

  it('distance asc puts nearest first, unknown last', () => {
    const distance = (r: RouteListItem) => (r.id === 1 ? 500 : r.id === 2 ? Infinity : 100)
    const out = sortRoutes([route({ id: 1 }), route({ id: 2 }), route({ id: 3 })], 'distance', 'asc', distance)
    expect(ids(out)).toEqual([3, 1, 2])
  })
})
