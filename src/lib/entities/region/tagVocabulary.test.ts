import { describe, expect, it } from 'vitest'
import type { RegionMembership } from './dto'
import { userRegion } from './fixture'
import { emptyRegionSettings } from './settings'
import { allRegionTags, DEFAULT_TAGS, tagNameSchema } from './tagVocabulary'

const region = (regionFk: number, tags?: string[]): RegionMembership => ({
  ...userRegion(regionFk),
  settings: tags == null ? emptyRegionSettings() : { mapLayers: [], tags },
})

describe('tagNameSchema', () => {
  it('trims and accepts a short default', () => {
    expect(tagNameSchema.parse('  SD  ')).toBe('SD')
  })

  it('rejects empty, over-long, and comma-carrying names', () => {
    expect(tagNameSchema.safeParse('   ').success).toBe(false)
    expect(tagNameSchema.safeParse('x'.repeat(31)).success).toBe(false)
    // The map filter encodes a selection as `?tags=a,b` and splits it back apart.
    expect(tagNameSchema.safeParse('sit start, low').success).toBe(false)
  })
})

describe('allRegionTags', () => {
  it('unions the regions, sorted, with a word two of them share appearing once', () => {
    expect(allRegionTags([region(1, ['high', 'SD']), region(2, ['SD', 'dyno'])])).toEqual(['SD', 'dyno', 'high'])
  })

  it('reads a region with no vocabulary configured as having the defaults', () => {
    // Not the parse-failure case, which `RegionMembership` can no longer express: `tagsComplete`
    // carries that now, and `toRegionMembership` owns it (see mapper.test.ts).
    expect(allRegionTags([region(1)])).toEqual([...DEFAULT_TAGS].sort())
  })

  it('has nothing to offer a user who belongs to no region', () => {
    expect(allRegionTags([])).toEqual([])
  })
})
