/**
 * `mapLayersFingerprint` is what lets the map-layers form prove it is replacing the layers it
 * actually read. The screen's default state is destructive (an empty submission means "remove them
 * all"), and four review rounds each closed one route to submitting one by accident and left
 * another open, so the guard has to be about content rather than about gates.
 *
 * A count was the first attempt and every surviving path preserved it: delete one layer, add
 * another, and three is still three.
 */
import { describe, expect, it } from 'vitest'
import { mapLayersFingerprint, readRegionSettings } from './settings'
import type { MapLayer } from './settings'

const layer = (name: string, extra: Partial<MapLayer> = {}): MapLayer => ({
  attributions: null,
  minZoom: null,
  name,
  opacity: null,
  params: null,
  type: 'wms',
  url: `https://example.test/${name}`,
  ...extra,
})

describe('mapLayersFingerprint', () => {
  it('is stable across two reads of the same layers', () => {
    expect(mapLayersFingerprint([layer('a'), layer('b')])).toBe(mapLayersFingerprint([layer('a'), layer('b')]))
  })

  it('tells an empty list apart from anything else, which is what a never-loaded form submits', () => {
    expect(mapLayersFingerprint([])).not.toBe(mapLayersFingerprint([layer('a')]))
  })

  it('changes when one layer is swapped for another, which a count does not', () => {
    // Two admins: the form loaded [a, b, c], someone else removed c and added d. Same length, so
    // the count guard passed and the stale save resurrected c while destroying d, silently.
    const loaded = [layer('a'), layer('b'), layer('c')]
    const now = [layer('a'), layer('b'), layer('d')]

    expect(loaded).toHaveLength(now.length)
    expect(mapLayersFingerprint(loaded)).not.toBe(mapLayersFingerprint(now))
  })

  it('changes when the order changes', () => {
    expect(mapLayersFingerprint([layer('a'), layer('b')])).not.toBe(mapLayersFingerprint([layer('b'), layer('a')]))
  })

  it('changes when a field inside a layer changes', () => {
    expect(mapLayersFingerprint([layer('a')])).not.toBe(mapLayersFingerprint([layer('a', { opacity: 0.5 })]))
  })

  it('reproduces a fingerprint produced outside this codebase, from the real stored row', () => {
    // The property the whole guard rests on, and the one the fixtures above cannot reach: the
    // client fingerprints what it parsed out of Zero's replica and the server fingerprints what it
    // parsed out of Postgres, then the two are compared byte for byte. Everything in the canonical
    // string has to survive that round trip, so this feeds one RAW blob (the shape region 6 holds:
    // a float, an int, escaped HTML in the attributions, a params record) through the real reader
    // twice, rather than hand-building `MapLayer` values that were never parsed at all.
    const blob = {
      mapLayers: [
        {
          attributions: [
            '© <a href="https://geodaten.bayern.de/" target="_blank">Bayerische Vermessungsverwaltung</a>',
            '© <a href="http://www.bkg.bund.de/" target="_blank">Bundesamt für Kartographie und Geodäsie (2022)</a>',
            '<a href="https://sg.geodatenzentrum.de/web_public/Datenquellen_TopPlus_Open.pdf" target="_blank">Datenquellen</a>',
          ],
          minZoom: 14,
          name: 'Bayern Relief',
          opacity: 0.7,
          params: { LAYERS: 'by_relief_schraeglicht' },
          type: 'wms',
          url: 'https://geoservices.bayern.de/od/wms/dgm/v1/relief',
        },
      ],
    }

    const stored = readRegionSettings(blob)

    expect(stored.layersComplete).toBe(true)
    // The constant is the point. Comparing the function to itself in one process holds for any
    // implementation, including a broken one; this value was produced twice OUTSIDE this test, by
    // the client in a browser off Zero's replica and by Node off the Postgres jsonb, for exactly
    // this stored row. So it pins the things a same-process comparison cannot: the float's
    // formatting, the escaped quotes in the attributions, key order, and the `?? null` collapse.
    expect(mapLayersFingerprint(stored.settings.mapLayers)).toBe('1-1jmo21m')

    // Identity, not equality: two independent reads produce equal fingerprints whether or not the
    // reader aliases its input, so comparing them proved nothing. What matters is that the caller
    // cannot reach into the blob a membership was built from.
    expect(stored.settings.mapLayers).not.toBe(blob.mapLayers)
    expect(stored.settings.mapLayers[0]).not.toBe(blob.mapLayers[0])
    // The nested containers too, which are what a caller would actually reach into. They are
    // cloned today only because zod builds fresh ones; nothing else says they have to be.
    expect(stored.settings.mapLayers[0].params).not.toBe(blob.mapLayers[0].params)
    expect(stored.settings.mapLayers[0].attributions).not.toBe(blob.mapLayers[0].attributions)
  })

  it('sorts params by code unit, not by collation', () => {
    // `_` (U+005F) sorts after `B` by code unit and before it under every collation, because
    // collation weakens punctuation rather than following a language rule. Verified across the
    // runtime default, en-US, da-DK, sv-SE and tr-TR: all five disagree with code-unit order here,
    // so this fails in whatever locale the runner resolves to if the comparator in
    // `mapLayersFingerprint` is ever tidied back into `localeCompare`. That matters because the
    // value is computed in the reader's browser and on the server and compared byte for byte: a
    // disagreement means a permanent "someone else changed this" on every save, and reloading
    // recomputes the same two answers, so the error routes the reader away from the cause.
    const params: Record<string, string> = {}
    params.A_B = '1'
    params.AB = '2'

    expect(mapLayersFingerprint([layer('a', { params })])).toBe('1-1ssr5hr')
  })

  it('ignores the key order of a layer params object', () => {
    // Read back from jsonb, so key order is whatever Postgres returns rather than what was written.
    // Built by assignment, not as literals: the formatter sorts keys in a literal, which would make
    // both sides identical and the assertion vacuous.
    const ordered: Record<string, string> = {}
    ordered.LAYERS = 'x'
    ordered.VERSION = '1.3.0'
    const reversed: Record<string, string> = {}
    reversed.VERSION = '1.3.0'
    reversed.LAYERS = 'x'

    expect(Object.keys(ordered)).not.toEqual(Object.keys(reversed))
    expect(mapLayersFingerprint([layer('a', { params: ordered })])).toBe(
      mapLayersFingerprint([layer('a', { params: reversed })]),
    )
  })
})
