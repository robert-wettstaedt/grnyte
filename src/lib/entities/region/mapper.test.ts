import { describe, expect, it } from 'vitest'
import type { RegionMemberRow } from './mapper'
import { seatState, toRegionMembership } from './mapper'
import { DEFAULT_TAGS } from './tagVocabulary'

describe('seatState', () => {
  it('is ok while there is room to spare', () => {
    expect(seatState(0, 10)).toBe('ok')
    expect(seatState(8, 10)).toBe('ok')
  })

  it('warns on the last free seat', () => {
    expect(seatState(9, 10)).toBe('oneLeft')
  })

  it('is full once every seat is taken', () => {
    expect(seatState(10, 10)).toBe('full')
  })

  it('reports an over-full region as full rather than a state of its own', () => {
    // Regions seeded before the limit existed can sit above it; there is nothing
    // different for the user to do about it, so it reads the same as exactly full.
    expect(seatState(14, 10)).toBe('full')
  })

  it('is full for a region with no seats at all', () => {
    expect(seatState(0, 0)).toBe('full')
  })

  it('warns rather than reporting full for a one-seat region that is empty', () => {
    expect(seatState(0, 1)).toBe('oneLeft')
  })
})

const LAYER = { name: 'Bayern Relief', type: 'wms', url: 'https://example.test/wms' }

/** A membership row as `listUserRegions` returns it, with its related region present or absent. */
const row = (region: null | Record<string, unknown>): RegionMemberRow =>
  ({ region, regionFk: 4, role: 'region_admin' }) as unknown as RegionMemberRow

/**
 * `toRegionMembership` answers three questions that have twice been collapsed into one: has the
 * region row arrived, did its settings blob parse whole, and what can be read off it either way.
 * A half-understood blob read as "nothing configured" let the map-layers form save zero rows back.
 */
describe('toRegionMembership', () => {
  it('reports a membership whose region row has not arrived as unsynced, and nothing as writable', () => {
    const membership = toRegionMembership(row(null))

    expect(membership.synced).toBe(false)
    // Both false, whatever an absent blob reads as: a screen checking only the flags would seed
    // from empty and save that over real data.
    expect(membership.layersComplete).toBe(false)
    expect(membership.tagsComplete).toBe(false)
    // Not a real name or vocabulary, which is what `synced: false` says.
    expect(membership.name).toBe('')
    expect(membership.settings.mapLayers).toEqual([])
    // The route pickers read the VALUE, not the flags, so fabricated tags would be offered and
    // then silently dropped by the server allowlist.
    expect(membership.settings.tags).toEqual([])
  })

  it('reads a region with nothing configured as synced, valid and empty', () => {
    const membership = toRegionMembership(row({ name: 'Fontainebleau', settings: null }))

    expect(membership.synced).toBe(true)
    expect(membership.layersComplete).toBe(true)
    expect(membership.settings).toEqual({ mapLayers: [], tags: DEFAULT_TAGS })
  })

  it('parses a stored layer through', () => {
    const membership = toRegionMembership(row({ name: 'Fontainebleau', settings: { mapLayers: [LAYER] } }))

    expect(membership.layersComplete).toBe(true)
    expect(membership.settings.mapLayers).toHaveLength(1)
  })

  it('marks a blob it cannot parse whole as invalid rather than as empty', () => {
    // The newer-writer/older-reader gap: reading this as `mapLayers: []` while claiming synced is
    // what made Save destructive.
    const membership = toRegionMembership(
      row({ name: 'Fontainebleau', settings: { mapLayers: [LAYER, { name: 'Tiles', type: 'wmts', url: 'x' }] } }),
    )

    expect(membership.synced).toBe(true)
    expect(membership.layersComplete).toBe(false)
  })

  it('keeps the tag vocabulary when only the layers fail to parse', () => {
    // Per key, not all-or-nothing: one unrecognised layer used to take the region's tags with it.
    const membership = toRegionMembership(
      row({
        name: 'Fontainebleau',
        settings: { mapLayers: [{ name: 'Tiles', type: 'wmts', url: 'x' }], tags: ['SD', 'lip'] },
      }),
    )

    expect(membership.layersComplete).toBe(false)
    expect(membership.settings.tags).toEqual(['SD', 'lip'])
  })

  it('keeps the layers it can read when one of them fails', () => {
    // Per ELEMENT, not per key: dropping the array for one bad entry took the remaining overlays
    // off every member's map, and the licence credits owed for them with it.
    const membership = toRegionMembership(
      row({ name: 'Fontainebleau', settings: { mapLayers: [LAYER, { name: 'Tiles', type: 'wmts', url: 'x' }] } }),
    )

    expect(membership.settings.mapLayers).toHaveLength(1)
    expect(membership.settings.mapLayers[0].name).toBe('Bayern Relief')
    // ...but the key may not be written back, because what it holds is short of what is stored.
    expect(membership.layersComplete).toBe(false)
  })

  it('marks the vocabulary unwritable when only the tags fail to parse', () => {
    // The tag mutations rewrite the whole vocabulary from what they read.
    const membership = toRegionMembership(
      row({ name: 'Fontainebleau', settings: { mapLayers: [LAYER], tags: [{ not: 'a string' }] } }),
    )

    expect(membership.tagsComplete).toBe(false)
    expect(membership.layersComplete).toBe(true)
    expect(membership.settings.mapLayers).toHaveLength(1)
  })

  it('refuses a layer carrying a key it does not know rather than silently dropping it', () => {
    // A plain `z.object` strips an unknown key and still reports SUCCESS, so a newer build's layer
    // read as complete and was saved back short of it. Neither a count nor a fingerprint can see
    // this: they run on the parsed type. Detection has to happen AT the parse.
    const membership = toRegionMembership(
      row({ name: 'Fontainebleau', settings: { mapLayers: [{ ...LAYER, maxZoom: 12 }] } }),
    )

    expect(membership.layersComplete).toBe(false)
    // And it still draws: collapsing the two parses into one strict one took the layer off the
    // map entirely, and asserting the flag alone did not notice.
    expect(membership.settings.mapLayers).toHaveLength(1)
    expect(membership.settings.mapLayers[0].name).toBe('Bayern Relief')
  })

  it('returns a real stored vocabulary as stored, not the defaults', () => {
    // The fixture is the same SET as DEFAULT_TAGS in a different ORDER, so returning the defaults
    // by mistake still passes a length check. Order is the discriminator.
    const tags = ['benchmark', 'defined', 'high', 'project', 'SD', 'trav-l-r', 'trav-r-l']
    const membership = toRegionMembership(row({ name: 'Test', settings: { tags } }))

    expect(membership.settings.tags).toEqual(tags)
    expect(membership.tagsComplete).toBe(true)
  })

  it('hands back a copy of the defaults, never the shared array', () => {
    // Handing out the module-level array would let one `push` downstream rewrite the defaults
    // for the whole process.
    const membership = toRegionMembership(row({ name: 'Fresh', settings: null }))

    expect(membership.settings.tags).toEqual(DEFAULT_TAGS)
    expect(membership.settings.tags).not.toBe(DEFAULT_TAGS)
  })

  it('keeps the tags it can read when one entry is not a string', () => {
    const membership = toRegionMembership(row({ name: 'Fontainebleau', settings: { tags: ['SD', 42, 'lip'] } }))

    expect(membership.settings.tags).toEqual(['SD', 'lip'])
    expect(membership.tagsComplete).toBe(false)
  })

  it('reads a blob that is not an object at all without throwing, and writes nothing back', () => {
    // Reachable: the write uses `||`, and Postgres appends when the left side is an array. A throw
    // here is every request by every member of the region failing.
    for (const blob of [[], 'nope', 7, true] as unknown[]) {
      const membership = toRegionMembership(row({ name: 'Fontainebleau', settings: blob }))

      expect(membership.synced).toBe(true)
      expect(membership.layersComplete).toBe(false)
      expect(membership.tagsComplete).toBe(false)
      expect(membership.settings.mapLayers).toEqual([])
      // Without it, reverting to `emptyRegionSettings()` stays green while every member gets
      // seven writable tags the region never had.
      expect(membership.settings.tags).toEqual([])
    }
  })
})
