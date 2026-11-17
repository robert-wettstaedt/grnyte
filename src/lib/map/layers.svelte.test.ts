import type { BlockDetail } from '$lib/entities/block/dto'
import { buildGradeDonutSvg } from '$lib/entities/grade/donut'
import type OlMap from 'ol/Map'
import CircleStyle from 'ol/style/Circle'
import type Style from 'ol/style/Style'
import { describe, expect, it } from 'vitest'
import { buildBlockFeatures, createBlockLayer } from './layers.svelte'

const block = { geolocation: { estimated: false, lat: 47, long: 8 }, id: 7, name: 'Block' } as unknown as BlockDetail
const map = { getView: () => ({ getZoom: () => 16 }) } as unknown as OlMap

/** The marker a block draws: its circle's radius and the text inside it. */
function marker(routeCountByBlock: Map<number, number>, countsUnknown: boolean) {
  const [feature] = buildBlockFeatures([block], routeCountByBlock, countsUnknown)
  const styleFn = createBlockLayer(map, () => undefined).getStyleFunction()!
  const [circle] = styleFn(feature, 1) as Style[]
  return { radius: (circle.getImage() as CircleStyle).getRadius(), text: circle.getText()?.getText() }
}

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
