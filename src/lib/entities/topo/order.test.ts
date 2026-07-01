import { describe, expect, it } from 'vitest'
import type { TopoLine, TopoView } from './dto'
import { convertPathToPoints } from './mapper'
import { orderRoutesByTopo } from './order'

const line = (routeId: number, path: string): TopoLine => ({
  id: routeId,
  routeId,
  name: '',
  topType: 'top',
  gradeFk: undefined,
  points: convertPathToPoints(path),
})

const view = (id: number, ...lines: TopoLine[]): TopoView => ({ id, imagePath: '', lines })

describe('orderRoutesByTopo', () => {
  it('orders by leftmost start hold within a topo', () => {
    const views = [view(1, line(10, 'M600,900 L600,200 Z'), line(20, 'M200,900 L200,200 Z'))]
    const ordered = orderRoutesByTopo([{ id: 10 }, { id: 20 }], views)
    expect(ordered.map((r) => r.id)).toEqual([20, 10])
  })

  it('keeps topos in order — all of topo 0 before topo 1', () => {
    const views = [view(1, line(10, 'M900,900 L900,200 Z')), view(2, line(20, 'M100,900 L100,200 Z'))]
    const ordered = orderRoutesByTopo([{ id: 20 }, { id: 10 }], views)
    expect(ordered.map((r) => r.id)).toEqual([10, 20])
  })

  it('places undrawn routes last, preserving their input order', () => {
    const views = [view(1, line(10, 'M300,900 L300,200 Z'))]
    const ordered = orderRoutesByTopo([{ id: 99 }, { id: 10 }, { id: 98 }], views)
    expect(ordered.map((r) => r.id)).toEqual([10, 99, 98])
  })

  it('uses a route’s first appearance across topos', () => {
    // Route 10 is drawn far right on topo 0 and far left on topo 1; first
    // appearance (topo 0) wins, so it sorts after route 20 which sits left on topo 0.
    const views = [
      view(1, line(10, 'M900,900 L900,200 Z'), line(20, 'M100,900 L100,200 Z')),
      view(2, line(10, 'M050,900 L050,200 Z')),
    ]
    const ordered = orderRoutesByTopo([{ id: 10 }, { id: 20 }], views)
    expect(ordered.map((r) => r.id)).toEqual([20, 10])
  })
})
