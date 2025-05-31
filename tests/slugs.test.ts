import { convertAreaSlug } from '$lib/helper.server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('$lib/db/db.server.ts', () => ({}))

describe('convertAreaSlug', () => {
  it('should convert a valid slug string into the correct object', () => {
    const params = { slugs: 'area1/area2/area3-123' }
    const result = convertAreaSlug(params)
    expect(result).toEqual({
      areaSlug: 'area3',
      areaId: 123,
      canAddArea: true,
      path: ['area1', 'area2', 'area3-123'],
    })
  })

  it('should throw an error if the area ID is not a number', () => {
    const params = { slugs: 'area1/area2/area3-abc' }
    expect(() => convertAreaSlug(params)).toThrowError()
  })

  it('should return canAddArea as false if the path length exceeds MAX_AREA_NESTING_DEPTH', () => {
    const params = { slugs: 'area1/area2/area3/area4/area5-123' }
    const result = convertAreaSlug(params)
    expect(result.canAddArea).toBe(false)
  })
})
