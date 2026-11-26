import type { BlockDetail } from '$lib/entities/block/dto'
import { buildGradeDonutSvg } from '$lib/entities/grade/donut'
import type OlMap from 'ol/Map'
import CircleStyle from 'ol/style/Circle'
import type Style from 'ol/style/Style'
import { describe, expect, it } from 'vitest'
import { bboxTileUrl, buildBlockFeatures, createBlockLayer } from './layers.svelte'

const block = { geolocation: { estimated: false, lat: 47, long: 8 }, id: 7, name: 'Block' } as unknown as BlockDetail
const map = { getView: () => ({ getZoom: () => 16 }) } as unknown as OlMap

/** The marker a block draws: its circle's radius and the text inside it. */
function marker(routeCountByBlock: Map<number, number>, countsUnknown: boolean) {
  const [feature] = buildBlockFeatures([block], routeCountByBlock, countsUnknown)
  const styleFn = createBlockLayer(map, () => undefined).getStyleFunction()!
  const [circle] = styleFn(feature, 1) as Style[]
  return { radius: (circle.getImage() as CircleStyle).getRadius(), text: circle.getText()?.getText() }
}

describe('bboxTileUrl', () => {
  it("fills in the tile's EPSG:3857 extent, worked by hand for the north-west tile at zoom 1", () => {
    expect(bboxTileUrl('https://x.test/export?bbox={bbox-epsg-3857}', 1, 0, 0)).toBe(
      'https://x.test/export?bbox=-20037508.342789244,0,0,20037508.342789244',
    )
  })

  it('moves east with the column and south with the row, worked by hand for the south-east tile at zoom 1', () => {
    expect(bboxTileUrl('{bbox-epsg-3857}', 1, 1, 1)).toBe('0,-20037508.342789244,20037508.342789244,0')
  })

  it('percent-encodes the braces a pasted JSON parameter carries, which ArcGIS refuses raw', () => {
    // Browsers send `{` and `}` in a query as they are, and the server answers 400.
    expect(bboxTileUrl('https://x.test/exportImage?bbox={bbox-epsg-3857}&rule={"f":"Hillshade"}', 0, 0, 0)).toBe(
      'https://x.test/exportImage?bbox=-20037508.342789244,-20037508.342789244,20037508.342789244,20037508.342789244&rule=%7B%22f%22:%22Hillshade%22%7D',
    )
  })

  it('leaves an address someone already encoded as it is', () => {
    expect(bboxTileUrl('{bbox-epsg-3857}&rule=%7B%22f%22%7D', 0, 0, 0)).toMatch(/&rule=%7B%22f%22%7D$/)
  })

  it('fills every placeholder, for services that want the extent twice', () => {
    expect(bboxTileUrl('a={bbox-epsg-3857}&b={bbox-epsg-3857}', 0, 0, 0)).toBe(
      'a=-20037508.342789244,-20037508.342789244,20037508.342789244,20037508.342789244&b=-20037508.342789244,-20037508.342789244,20037508.342789244,20037508.342789244',
    )
  })
})

describe('a block marker while routes are still arriving', () => {
  it('draws at the counted size with no number, not the small dot of a block without routes', () => {
    expect(marker(new Map(), true)).toEqual({ radius: 12, text: '' })
    expect(marker(new Map(), false).radius).toBe(5)
    expect(marker(new Map([[7, 3]]), false)).toEqual({ radius: 12, text: '3' })
  })
})

describe('an area donut while routes are still arriving', () => {
  it('shows no number rather than a false 0', () => {
    expect(buildGradeDonutSvg(new Map(), null, 36)).not.toContain('<text')
    expect(buildGradeDonutSvg(new Map(), 0, 36)).toContain('>0</text>')
  })
})
