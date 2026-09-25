import { describe, expect, it } from 'vitest'
import { cameraTarget, entityOf, type TargetBlock, type TargetInput } from './cameraTarget'

const PADDING: [number, number, number, number] = [60, 60, 400, 60]

const block = (id: number, areaIds: number[], geo?: [number, number]): TargetBlock => ({
  areas: areaIds.map((areaId) => ({ id: areaId })),
  geolocation: geo == null ? null : { lat: geo[0], long: geo[1] },
  id,
})

const input = (over: Partial<TargetInput>): TargetInput => ({
  blocks: [],
  id: 1,
  padding: PADDING,
  parkingLocations: [],
  routeId: '',
  showOnMapRequest: 0,
  ...over,
})

describe('entityOf', () => {
  it('names each entity that has a detail route', () => {
    expect(entityOf('/(app)/(shell)/(explore)/(map)/parking/[id]')).toBe('parking')
    expect(entityOf('/(app)/(shell)/(explore)/(map)/blocks/[id]')).toBe('blocks')
    expect(entityOf('/(app)/(shell)/(explore)/(map)/areas/[id]')).toBe('areas')
  })

  it('keeps naming the entity on its nested routes', () => {
    expect(entityOf('/(app)/(shell)/(explore)/(map)/areas/[id]/routes')).toBe('areas')
    expect(entityOf('/(app)/(shell)/(explore)/(map)/blocks/[id]/topos')).toBe('blocks')
  })

  // The trap this module exists for. A fourth detail route must claim nothing, instead of falling
  // through to `areas` and framing a real area under the new route's id.
  it('names nothing for a route it has not been taught', () => {
    expect(entityOf('/(app)/(shell)/(explore)/(map)/routes/[id]')).toBeNull()
    expect(entityOf('/(app)/(shell)/(explore)/(map)')).toBeNull()
    expect(entityOf('')).toBeNull()
  })
})

describe('cameraTarget', () => {
  it('wants nothing of the camera with no entity open', () => {
    expect(cameraTarget(input({ routeId: '/(app)/(shell)/(explore)/(map)' }))).toBeNull()
  })

  it('wants nothing when the route carries no usable id', () => {
    expect(cameraTarget(input({ id: Number.NaN, routeId: 'blocks/[id]' }))).toBeNull()
  })

  // The invariant two separate derivations could not hold. A claim without a framing is normal. A
  // framing without a claim is not, and the two must never name different entities.
  it('claims even when the row it will frame has not synced', () => {
    const target = cameraTarget(input({ id: 79, routeId: 'blocks/[id]' }))
    expect(target?.claim).toEqual({ key: 'blocks/79#0', kind: 'entity' })
    expect(target?.focus).toBeNull()
  })

  it('keys the claim on the entity, so its own nested routes do not re-frame', () => {
    const detail = cameraTarget(input({ id: 5, routeId: 'areas/[id]' }))
    const nested = cameraTarget(input({ id: 5, routeId: 'areas/[id]/routes' }))
    expect(nested?.claim).toEqual(detail?.claim)
  })

  it('makes a Show press a fresh claim', () => {
    const first = cameraTarget(input({ id: 79, routeId: 'blocks/[id]', showOnMapRequest: 0 }))
    const again = cameraTarget(input({ id: 79, routeId: 'blocks/[id]', showOnMapRequest: 1 }))
    expect(again?.claim).not.toEqual(first?.claim)
  })

  it('frames a block on its own pin', () => {
    const target = cameraTarget(input({ blocks: [block(79, [5], [48.1, 11.5])], id: 79, routeId: 'blocks/[id]' }))
    expect(target?.focus).toEqual({ center: [48.1, 11.5], padding: PADDING, zoom: 16 })
  })

  it('frames parking on its own pin', () => {
    const target = cameraTarget(
      input({
        id: 3,
        parkingLocations: [{ id: 3, lat: 48.4, long: 2.6 } as never],
        routeId: 'parking/[id]',
      }),
    )
    expect(target?.focus).toEqual({ center: [48.4, 2.6], padding: PADDING, zoom: 16 })
  })

  it('frames an area on the blocks beneath it, wherever in its subtree they sit', () => {
    const target = cameraTarget(
      input({
        blocks: [block(1, [5], [48.1, 11.5]), block(2, [9, 5], [48.3, 11.9]), block(3, [7], [1, 1])],
        id: 5,
        routeId: 'areas/[id]',
      }),
    )
    expect(target?.focus).toEqual({ extent: [48.1, 11.5, 48.3, 11.9], padding: PADDING })
  })

  it('frames nothing for an area whose blocks have no pins', () => {
    const target = cameraTarget(input({ blocks: [block(1, [5])], id: 5, routeId: 'areas/[id]' }))
    expect(target?.focus).toBeNull()
    // Still claims, so a late pin does not let something else take the camera first.
    expect(target?.claim).not.toBeNull()
  })

  it('ignores an unlocated block when framing its area', () => {
    const target = cameraTarget(
      input({ blocks: [block(1, [5], [48.1, 11.5]), block(2, [5])], id: 5, routeId: 'areas/[id]' }),
    )
    expect(target?.focus).toEqual({ extent: [48.1, 11.5, 48.1, 11.5], padding: PADDING })
  })
})
