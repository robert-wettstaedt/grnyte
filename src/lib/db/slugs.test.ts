import { convertAreaSlug } from '$lib/helper.server'
import { generateSlug } from '$lib/db/schema'
import { describe, expect, it, vi } from 'vitest'

vi.mock('$lib/db/db.server.ts', () => ({}))

// Mock the CUID function for consistent testing
vi.mock('@paralleldrive/cuid2', () => ({
  createId: vi.fn(() => 'test-cuid-123'),
}))

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

describe('generateSlug', () => {
  it('should generate a slug from a regular string', () => {
    const result = generateSlug('My Awesome Climbing Area')
    expect(result).toBe('my-awesome-climbing-area')
  })

  it('should handle special characters and diacritics', () => {
    const result = generateSlug('Café & Crags! (Trad)')
    expect(result).toBe('cafe-crags-trad')
  })

  it('should handle multiple spaces and hyphens', () => {
    const result = generateSlug('   Area --  Name   ')
    expect(result).toBe('area-name')
  })

  it('should append CUID to purely numeric slugs', () => {
    const result = generateSlug('123')
    expect(result).toBe('123-test-cuid-123')
  })

  it('should append CUID to numeric string that becomes purely numeric after processing', () => {
    const result = generateSlug('   456   ')
    expect(result).toBe('456-test-cuid-123')
  })

  it('should not append CUID to mixed alphanumeric slugs', () => {
    const result = generateSlug('Area 123')
    expect(result).toBe('area-123')
  })

  it('should not append CUID to slugs that contain letters even after normalization', () => {
    const result = generateSlug('123a')
    expect(result).toBe('123a')
  })

  it('should handle edge case of zero', () => {
    const result = generateSlug('0')
    expect(result).toBe('0-test-cuid-123')
  })

  it('should handle negative numbers that become positive after normalization', () => {
    const result = generateSlug('-42')
    expect(result).toBe('42-test-cuid-123')
  })
})
