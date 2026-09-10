/**
 * `mapLayersFingerprint` lets the map-layers form prove it is replacing the layers it read. The
 * screen's default state is destructive, so the guard has to be about content rather than gates.
 * A count was the first attempt: delete one layer, add another, and three is still three.
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
    // The form loaded [a, b, c]; someone else removed c and added d. Same length, so the count
    // guard passed and the stale save resurrected c while destroying d.
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
    // Client and server fingerprint what each parsed, then compare byte for byte, so everything
    // in the canonical string has to survive that round trip. One RAW blob through the real
    // reader twice, rather than hand-built `MapLayer` values that were never parsed.
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
    // The constant is the point: a same-process comparison holds for any implementation. This
    // value came from a real browser and a real Node read of the same row.
    expect(mapLayersFingerprint(stored.settings.mapLayers)).toBe('1-1jmo21m')

    // Identity, not equality: equal fingerprints hold whether or not the reader aliases its
    // input. What matters is that the caller cannot reach into the blob.
    expect(stored.settings.mapLayers).not.toBe(blob.mapLayers)
    expect(stored.settings.mapLayers[0]).not.toBe(blob.mapLayers[0])
    // The nested containers too, cloned today only because zod builds fresh ones.
    expect(stored.settings.mapLayers[0].params).not.toBe(blob.mapLayers[0].params)
    expect(stored.settings.mapLayers[0].attributions).not.toBe(blob.mapLayers[0].attributions)
  })

  it('sorts params by code unit, not by collation', () => {
    // `_` sorts after `B` by code unit and before it under every collation, so this reddens if
    // the comparator is ever tidied back into `localeCompare`. Two collators disagreeing means a
    // permanent "someone else changed this" that reloading cannot clear.
    const params: Record<string, string> = {}
    params.A_B = '1'
    params.AB = '2'

    expect(mapLayersFingerprint([layer('a', { params })])).toBe('1-1ssr5hr')
  })

  it('ignores the key order of a layer params object', () => {
    // Built by assignment, not as literals: the formatter sorts keys in a literal, which would
    // make both sides identical and the assertion vacuous.
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
