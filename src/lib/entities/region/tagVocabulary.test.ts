import { describe, expect, it } from 'vitest'
import type { RegionMembership } from './dto'
import { userRegion } from './fixture'
import { emptyRegionSettings } from './settings'
import { allRegionTags, DEFAULT_TAGS, regionTags, tagNameSchema } from './tagVocabulary'

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

describe('regionTags', () => {
  it('reads the named region’s vocabulary, not a neighbour’s', () => {
    expect(regionTags([region(1, ['high', 'SD']), region(2, ['dyno'])], 1)).toEqual(['high', 'SD'])
  })

  it('offers a non-member nothing, and specifically not the defaults', () => {
    // `routes.remote.ts` feeds this into `allowedTags` as the allowlist a route write is checked
    // against, so a not-found branch falling back to the defaults is seven writable tags.
    expect(regionTags([region(1, ['high'])], 2)).toEqual([])
  })

  it('still gives a member of an unconfigured region the defaults', () => {
    // The negative above is only meaningful next to this: `[]` is what NOT being a member returns,
    // not what every miss returns.
    expect(regionTags([region(1)], 1)).toEqual(DEFAULT_TAGS)
  })

  it('has nothing to offer a user who belongs to no region', () => {
    expect(regionTags([], 1)).toEqual([])
  })
})
