import { describe, expect, it } from 'vitest'
import type { TopoLine, TopoView } from './dto'
import { convertPathToPoints } from './mapper'
import { orderRoutesByTopo } from './order'

/** `id` only ever differs from `routeId` for a route drawn twice on one topo. */
const line = (routeId: number, path: string, id = routeId): TopoLine => ({
  gradeFk: undefined,
  id,
  name: '',
  points: convertPathToPoints(path),
  routeId,
  topType: 'top',
})

const view = (id: number, ...lines: TopoLine[]): TopoView => ({ id, imagePath: '', lines })

const idsInOrder = (routes: { id: number }[], views: TopoView[]) => orderRoutesByTopo(routes, views).map((r) => r.id)

describe('orderRoutesByTopo', () => {
  it('orders by leftmost start hold within a topo', () => {
    const views = [view(1, line(10, 'M600,900 L600,200 Z'), line(20, 'M200,900 L200,200 Z'))]
    expect(idsInOrder([{ id: 10 }, { id: 20 }], views)).toEqual([20, 10])
  })

  // Every other fixture here draws a vertical line with one start hold, where the start filter,
  // the fallback and `Math.min` are all indistinguishable. These two lines are not vertical.
  it('orders by the start hold, not by a line’s other points', () => {
    const views = [view(1, line(10, 'M800,900 L100,500 L100,200 Z'), line(20, 'M400,900 L400,200 Z'))]
    expect(idsInOrder([{ id: 10 }, { id: 20 }], views)).toEqual([20, 10])
  })

  it('falls back to the leftmost of all points when a line has no start hold', () => {
    // A path opening with `L` carries no start hold, which a topo drawn before start holds existed
    // still does.
    const views = [view(1, line(10, 'L700,900 L200,200 Z'), line(20, 'M400,900 L400,200 Z'))]
    expect(idsInOrder([{ id: 10 }, { id: 20 }], views)).toEqual([10, 20])
  })

  // Both draw orders, because the rule is leftmost-wins and not last-wins or first-wins.
  it('anchors a route drawn twice on one topo to its leftmost line, drawn second', () => {
    const views = [
      view(1, line(10, 'M900,900 L900,200 Z'), line(10, 'M100,900 L100,200 Z', 11), line(20, 'M400,900 L400,200 Z')),
    ]
    expect(idsInOrder([{ id: 20 }, { id: 10 }], views)).toEqual([10, 20])
  })

  it('anchors a route drawn twice on one topo to its leftmost line, drawn first', () => {
    const views = [
      view(1, line(10, 'M100,900 L100,200 Z'), line(10, 'M900,900 L900,200 Z', 11), line(20, 'M400,900 L400,200 Z')),
    ]
    expect(idsInOrder([{ id: 20 }, { id: 10 }], views)).toEqual([10, 20])
  })

  it('keeps topos in order: all of topo 0 before topo 1', () => {
    const views = [view(1, line(10, 'M900,900 L900,200 Z')), view(2, line(20, 'M100,900 L100,200 Z'))]
    expect(idsInOrder([{ id: 20 }, { id: 10 }], views)).toEqual([10, 20])
  })

  it('places undrawn routes last, preserving their input order', () => {
    const views = [view(1, line(10, 'M300,900 L300,200 Z'))]
    expect(idsInOrder([{ id: 99 }, { id: 10 }, { id: 98 }], views)).toEqual([10, 99, 98])
  })

  it('uses a route’s first appearance across topos', () => {
    // Route 10 is drawn far right on topo 0 and far left on topo 1; first
    // appearance (topo 0) wins, so it sorts after route 20 which sits left on topo 0.
    const views = [
      view(1, line(10, 'M900,900 L900,200 Z'), line(20, 'M100,900 L100,200 Z')),
      view(2, line(10, 'M050,900 L050,200 Z')),
    ]
    expect(idsInOrder([{ id: 10 }, { id: 20 }], views)).toEqual([20, 10])
  })
})
