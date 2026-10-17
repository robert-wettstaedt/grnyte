import { describe, expect, it } from 'vitest'
import { parseRouteFilter, writeRouteFilter, type ParsedRouteFilter } from './filter'

const EMPTY: ParsedRouteFilter = {
  ascentStatus: undefined,
  favoritesOnly: false,
  filter: {
    firstAscensionists: undefined,
    hasBeta: undefined,
    hasTopo: undefined,
    maxGrade: undefined,
    minGrade: undefined,
    minRating: undefined,
    tags: undefined,
  },
}

const FULL: ParsedRouteFilter = {
  ascentStatus: 'todo',
  favoritesOnly: true,
  filter: {
    firstAscensionists: [3, 4],
    hasBeta: true,
    hasTopo: true,
    maxGrade: 9,
    minGrade: 5,
    minRating: 2,
    tags: ['crimps', 'roof'],
  },
}

const written = (from: string, parsed: ParsedRouteFilter) => {
  const params = new URLSearchParams(from)
  writeRouteFilter(params, parsed)
  return params.toString()
}

describe('writeRouteFilter', () => {
  it('reads back as what it wrote', () => {
    for (const parsed of [EMPTY, FULL, { ...EMPTY, ascentStatus: 'project' as const }]) {
      expect(parseRouteFilter(new URLSearchParams(written('', parsed)))).toEqual(parsed)
    }
  })

  // The bytes the filter sheet produced before this writer existed: a shared link is this string.
  it('appends every set key after the params it does not own, in key-list order', () => {
    expect(written('sort=name&dir=asc', FULL)).toBe(
      'sort=name&dir=asc&minGrade=5&maxGrade=9&minRating=2&ascentStatus=todo&tags=crimps%2Croof&hasTopo=1&hasBeta=1&favorites=1&firstAscensionists=3%2C4',
    )
  })

  it('removes every cleared key and keeps the rest', () => {
    expect(written('minGrade=5&sort=name&tags=a&favorites=1&x=1', EMPTY)).toBe('sort=name&x=1')
  })

  it('keeps an existing key where it was', () => {
    const parsed = { ...EMPTY, filter: { ...EMPTY.filter, minGrade: 3, tags: ['b'] } }
    expect(written('tags=a&sort=name', parsed)).toBe('tags=b&sort=name&minGrade=3')
  })

  it('treats empty lists and a zero rating as unset', () => {
    const parsed = { ...EMPTY, filter: { ...EMPTY.filter, firstAscensionists: [], minRating: 0, tags: [] } }
    expect(written('minRating=2&tags=a&firstAscensionists=1', parsed)).toBe('')
  })
})
