import { describe, expect, it } from 'vitest'
import type { TopoView } from './dto'
import { convertPathToPoints, routeTopoThumb, selectTopoForRoute } from './mapper'

describe('convertPathToPoints', () => {
  it('parses start + top and drops the Z marker', () => {
    const points = convertPathToPoints('M765,688 L767,135 Z')
    expect(points.map((p) => p.type)).toEqual(['start', 'top'])
    expect(points[0]).toMatchObject({ x: 765, y: 688 })
    expect(points[1]).toMatchObject({ x: 767, y: 135 })
  })

  it('returns [] for an empty path', () => {
    expect(convertPathToPoints('   ')).toEqual([])
  })
})

describe('selectTopoForRoute', () => {
  const line = (id: number, routeId: number, path: string): TopoView['lines'][number] => ({
    id,
    routeId,
    name: '',
    topType: 'top',
    gradeFk: undefined,
    points: convertPathToPoints(path),
  })

  it('picks the topo where the route line has the most points', () => {
    const views: TopoView[] = [
      { id: 1, imagePath: 'a', lines: [line(10, 5, 'M0,0 L1,1')] },
      { id: 2, imagePath: 'b', lines: [line(20, 5, 'M0,0 L1,1 L2,2')] },
    ]
    expect(selectTopoForRoute(views, 5)?.view.id).toBe(2)
  })

  it('returns undefined when no topo has the route', () => {
    const views: TopoView[] = [{ id: 1, imagePath: 'a', lines: [line(10, 5, 'M0,0 L1,1')] }]
    expect(selectTopoForRoute(views, 99)).toBeUndefined()
  })
})

describe('routeTopoThumb', () => {
  it('picks the most complete line and its image, skipping undrawn/imageless rows', () => {
    const thumb = routeTopoThumb([
      { path: '', topo: { file: { path: 'blank' } } },
      { path: 'M0,0 L1,1', topo: { file: { path: 'short' } } },
      { path: 'M0,0 L1,1 L2,2', topo: { file: { path: 'long' } } },
      { path: 'M0,0 L1,1 L2,2 L3,3', topo: { file: { path: null } } },
    ])
    expect(thumb).toMatchObject({ imagePath: 'long' })
    expect(thumb?.points).toHaveLength(3)
  })

  it('returns undefined when the route is on no topo', () => {
    expect(routeTopoThumb([])).toBeUndefined()
  })
})
