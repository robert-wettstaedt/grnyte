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
 * `toRegionMembership` answers three questions that have twice been collapsed into one, at the cost
 * of data both times: has the region row arrived, did its settings blob parse whole, and what can
 * be read off it either way.
 *
 * The case worth pinning is a blob this build only half understands, which is what an older tab
 * sees of settings a newer one wrote. Reading it as "nothing configured" is what let the map-layers
 * form seed zero rows and save them back over the region's real layers.
 */
describe('toRegionMembership', () => {
  it('reports a membership whose region row has not arrived as unsynced, and nothing as writable', () => {
    const membership = toRegionMembership(row(null))

    expect(membership.synced).toBe(false)
    // Both false, whatever the absent blob would read as on its own: the `*Complete` flags are
    // documented as the gate for writing a key back, so a screen checking only those would seed
    // from an empty blob and save it over the region's real data.
    expect(membership.layersComplete).toBe(false)
    expect(membership.tagsComplete).toBe(false)
    // Not a real name and not a real vocabulary, which is exactly what `synced: false` is there to
    // say. A form seeding from these would save the placeholder.
    expect(membership.name).toBe('')
    expect(membership.settings.mapLayers).toEqual([])
    // The property the mapper guard exists for, and the one the route pickers read: they take the
    // VALUE, not the flags above, so without this a revert offers seven tags the region may not
    // use and the reader's pick is dropped by the server allowlist in silence.
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
    // A layer kind this build does not know, which is the newer-writer/older-reader gap. Reading
    // this as `mapLayers: []` while claiming the region synced is what made Save destructive: the
    // form rendered no layers and wrote that back over the ones that are stored.
    const membership = toRegionMembership(
      row({ name: 'Fontainebleau', settings: { mapLayers: [LAYER, { name: 'Tiles', type: 'wmts', url: 'x' }] } }),
    )

    expect(membership.synced).toBe(true)
    expect(membership.layersComplete).toBe(false)
  })

  it('keeps the tag vocabulary when only the layers fail to parse', () => {
    // Per key, not all-or-nothing: one unrecognised layer used to take the region's tags with it,
    // and `regionTags` doubles as the allowlist for what a route write may store.
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
    // Per ELEMENT, not per key. Dropping the whole array for one unrecognised entry took the
    // region's remaining overlays off every member's map, and the licence credits owed for them
    // with it, which is the outcome `$lib/map/attribution` exists to prevent.
    const membership = toRegionMembership(
      row({ name: 'Fontainebleau', settings: { mapLayers: [LAYER, { name: 'Tiles', type: 'wmts', url: 'x' }] } }),
    )

    expect(membership.settings.mapLayers).toHaveLength(1)
    expect(membership.settings.mapLayers[0].name).toBe('Bayern Relief')
    // ...but the key may not be written back, because what it holds is short of what is stored.
    expect(membership.layersComplete).toBe(false)
  })

  it('marks the vocabulary unwritable when only the tags fail to parse', () => {
    // The reciprocal direction, and the one that ends in destroyed data: the tag mutations rewrite
    // the whole vocabulary from what they read, and it doubles as the route-write allowlist.
    const membership = toRegionMembership(
      row({ name: 'Fontainebleau', settings: { mapLayers: [LAYER], tags: [{ not: 'a string' }] } }),
    )

    expect(membership.tagsComplete).toBe(false)
    expect(membership.layersComplete).toBe(true)
    expect(membership.settings.mapLayers).toHaveLength(1)
  })

  it('refuses a layer carrying a key it does not know rather than silently dropping it', () => {
    // The forward-compatibility case this whole seam exists for, one level below where it was
    // first fixed: a plain `z.object` strips an unknown key and still reports SUCCESS, so a layer
    // a newer build wrote read as complete, rendered short of that key, and was saved back without
    // it. Neither a count nor a fingerprint can see this, and not for want of trying: both run on
    // the parsed type, and `MapLayer` cannot represent a key it does not know, so the evidence is
    // already gone by the time they are called. Detection has to happen AT the parse, which is
    // what `z.strictObject` does.
    //
    // `maxZoom` as the fixture because it is the shape that would actually turn up: a field
    // somebody adds next to `minZoom`, which reads as belonging and sails straight through.
    const membership = toRegionMembership(
      row({ name: 'Fontainebleau', settings: { mapLayers: [{ ...LAYER, maxZoom: 12 }] } }),
    )

    expect(membership.layersComplete).toBe(false)
    // And it still draws. The loose parse feeds the map and the strict one only answers whether
    // the editor may write the key back; collapsing them into a single strict parse took the layer
    // off the map entirely, and asserting the flag alone did not notice.
    expect(membership.settings.mapLayers).toHaveLength(1)
    expect(membership.settings.mapLayers[0].name).toBe('Bayern Relief')
  })

  it('returns a real stored vocabulary as stored, not the defaults', () => {
    // The ordinary readable case, which the unreadable-blob work changed the path for. Region 6's
    // seven tags are deliberately the fixture: they are the same SET as DEFAULT_TAGS but in a
    // different ORDER, so returning the defaults by mistake would still be seven tags and would
    // still pass a length check. Order is the discriminator.
    const tags = ['benchmark', 'defined', 'high', 'project', 'SD', 'trav-l-r', 'trav-r-l']
    const membership = toRegionMembership(row({ name: 'Test', settings: { tags } }))

    expect(membership.settings.tags).toEqual(tags)
    expect(membership.tagsComplete).toBe(true)
  })

  it('hands back a copy of the defaults, never the shared array', () => {
    // `readRegionSettings` runs in the auth hook for every membership on every request and in a
    // `$derived` over every membership on the client, so handing out the module-level array would
    // let one `push` downstream rewrite the default vocabulary for the whole process.
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
    // Reachable: the settings write uses `||`, and Postgres appends rather than merges when the
    // left side is an array. This runs in the auth hook and in a `$derived` over every membership, so a
    // throw is not one bad region, it is every request by every member of it failing.
    for (const blob of [[], 'nope', 7, true] as unknown[]) {
      const membership = toRegionMembership(row({ name: 'Fontainebleau', settings: blob }))

      expect(membership.synced).toBe(true)
      expect(membership.layersComplete).toBe(false)
      expect(membership.tagsComplete).toBe(false)
      expect(membership.settings.mapLayers).toEqual([])
      // The property this commit is named for. Without it, reverting to `emptyRegionSettings()`
      // leaves the suite green while every member gets seven writable tags the region never had.
      expect(membership.settings.tags).toEqual([])
    }
  })
})
