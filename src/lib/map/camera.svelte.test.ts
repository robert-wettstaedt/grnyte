import { flushSync } from 'svelte'
import { describe, expect, it } from 'vitest'
import { canMove, claimKey, contentExtent, createCamera, nextOwner, type CameraView } from './camera.svelte'

/** Records every move and hands back each callback, so a test chooses when an animation ends. That
 *  timing is the point: only a move this module did not make spends the zoom floor. */
const recorder = (zoom = 10) => {
  const moves: { done?: (complete: boolean) => void; kind: 'animate' | 'fit'; options?: unknown; target?: unknown }[] =
    []
  const view: CameraView = {
    animate(options, done) {
      moves.push({ done, kind: 'animate', options })
    },
    fit(extent, options) {
      moves.push({ done: options?.callback, kind: 'fit', options, target: extent })
    },
    getZoom: () => zoom,
  }
  return { moves, view }
}

const BLOCK = { key: 'blocks/79#0', kind: 'entity' } as const
const MUNICH: [number, number] = [48.1372, 11.5756]

describe('canMove', () => {
  it('lets an entity move only its own camera', () => {
    expect(canMove({ key: 'blocks/79#0', kind: 'entity' }, BLOCK)).toBe(true)
    expect(canMove({ key: 'blocks/80#0', kind: 'entity' }, BLOCK)).toBe(false)
    expect(canMove({ kind: 'reader' }, BLOCK)).toBe(false)
  })

  it('lets the content fit move only an unowned camera', () => {
    expect(canMove({ kind: 'none' }, { kind: 'content' })).toBe(true)
    expect(canMove({ kind: 'reader' }, { kind: 'content' })).toBe(false)
    expect(canMove({ kind: 'location' }, { kind: 'content' })).toBe(false)
  })

  it('matches location and reader on kind alone', () => {
    expect(canMove({ kind: 'location' }, { kind: 'location' })).toBe(true)
    expect(canMove({ kind: 'reader' }, { kind: 'reader' })).toBe(true)
    expect(canMove({ kind: 'none' }, { kind: 'location' })).toBe(false)
  })
})

describe('nextOwner', () => {
  it('never lets the content fit take an owned camera', () => {
    expect(nextOwner({ kind: 'reader' }, { kind: 'content' })).toEqual({ kind: 'reader' })
    expect(nextOwner({ kind: 'none' }, { kind: 'content' })).toEqual({ kind: 'content' })
  })

  it('hands the camera to any other claim', () => {
    expect(nextOwner({ kind: 'location' }, { kind: 'reader' })).toEqual({ kind: 'reader' })
    expect(nextOwner({ kind: 'reader' }, BLOCK)).toEqual(BLOCK)
  })
})

describe('claimKey', () => {
  it('has no key for an unclaimed screen', () => {
    expect(claimKey(null)).toBeUndefined()
    expect(claimKey(undefined)).toBeUndefined()
    expect(claimKey({ key: 'blocks/79#0', kind: 'entity' })).toBe('entity:blocks/79#0')
  })
})

describe('contentExtent', () => {
  it('has nothing to frame with no points', () => {
    expect(contentExtent([])).toBeNull()
  })

  it('drops a block on another continent rather than zooming out to hold both', () => {
    const near: [number, number][] = [
      [48.1, 11.5],
      [48.2, 11.6],
      [48.3, 11.7],
    ]
    const withOutlier = contentExtent([...near, [-33.9, 151.2]])
    expect(withOutlier).toEqual(contentExtent(near))
  })

  it('keeps a single point, which is always its own median', () => {
    const one = contentExtent([MUNICH])
    expect(one).not.toBeNull()
    expect(one![0]).toBe(one![2])
  })
})

describe('camera ownership', () => {
  it('frames the region while nothing owns the camera, and claims it', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder()
    expect(camera.fitContent(view, [MUNICH])).toBe(true)
    expect(moves).toHaveLength(1)
    flushSync()
    expect(camera.owner).toEqual({ kind: 'content' })
  })

  it('does not reframe the region once the reader has panned', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder()
    camera.fitContent(view, [MUNICH])
    camera.readerMoved()
    expect(camera.fitContent(view, [MUNICH])).toBe(false)
    expect(moves).toHaveLength(1)
  })

  // The reported bug. A pan before any block arrived used to strand the map at zoom 4.
  it('still paints the region when the reader panned over an empty map', () => {
    const camera = createCamera(14)
    const { view } = recorder()
    camera.readerMoved()
    expect(camera.fitContent(view, [MUNICH])).toBe(true)
  })

  it('refuses a framing whose entity no longer owns the camera', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder()
    camera.claim(BLOCK)
    camera.readerMoved()
    expect(camera.applyFocus(view, { center: MUNICH, zoom: 16 }, BLOCK)).toBe(false)
    expect(moves).toHaveLength(0)
  })

  // The headline defect. The block's row arrives seconds later and must not take a camera the
  // reader pointed at themselves.
  it('holds a located camera against an entity framing that arrives late', () => {
    const camera = createCamera(14)
    const { view } = recorder()
    camera.locatePressed(view, [0, 0])
    expect(camera.applyFocus(view, { center: MUNICH, zoom: 16 }, BLOCK)).toBe(false)
  })

  it('lets the same entity reframe when it is asked again', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder()
    camera.claim(BLOCK)
    expect(camera.applyFocus(view, { center: MUNICH, zoom: 16 }, BLOCK)).toBe(true)
    // Same focus and same claim, so this is deduped.
    expect(camera.applyFocus(view, { center: MUNICH, zoom: 16 }, BLOCK)).toBe(false)
    // A Show press bumps the key, so the claim is fresh and must move again.
    camera.claim({ key: 'blocks/79#1', kind: 'entity' })
    expect(camera.applyFocus(view, { center: MUNICH, zoom: 16 }, BLOCK)).toBe(false)
    expect(camera.applyFocus(view, { center: MUNICH, zoom: 16 }, { key: 'blocks/79#1', kind: 'entity' })).toBe(true)
    expect(moves).toHaveLength(2)
  })

  it('does not release ownership when the route carries no entity', () => {
    const camera = createCamera(14)
    camera.claim(BLOCK)
    camera.claim(null)
    flushSync()
    expect(camera.owner).toEqual(BLOCK)
  })

  it('reports following only while location owns the camera', () => {
    const camera = createCamera(14)
    const { view } = recorder()
    expect(camera.isFollowingLocation).toBe(false)
    camera.locatePressed(view, null)
    flushSync()
    expect(camera.isFollowingLocation).toBe(true)
    camera.readerMoved()
    flushSync()
    expect(camera.isFollowingLocation).toBe(false)
  })

  it('hands the camera to the reader when tracking ends over a view worth keeping', () => {
    const camera = createCamera(14)
    const { view } = recorder()
    camera.fitContent(view, [MUNICH])
    camera.locatePressed(view, [0, 0])
    camera.followEnded()
    flushSync()
    expect(camera.owner).toEqual({ kind: 'reader' })
  })

  it('releases to nobody when tracking ends before anything framed, so the map is not stranded', () => {
    const camera = createCamera(14)
    const { view } = recorder()
    camera.locatePressed(view, null)
    camera.followEnded()
    flushSync()
    expect(camera.owner).toEqual({ kind: 'none' })
  })
})

describe('the zoom floor', () => {
  it('rides on the first fix when locate is pressed before one arrives', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder(4)
    camera.locatePressed(view, null)
    expect(moves).toHaveLength(0)
    camera.followFix(view, [0, 0])
    expect(moves[0].options).toMatchObject({ zoom: 14 })
  })

  it('is spent once, so a second fix does not zoom again', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder(4)
    camera.locatePressed(view, null)
    camera.followFix(view, [0, 0])
    moves[0].done?.(true)
    camera.followFix(view, [1, 1])
    expect(moves[1].options).not.toHaveProperty('zoom')
  })

  it('never reduces a scale the reader is already looking at', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder(18)
    camera.locatePressed(view, null)
    camera.followFix(view, [0, 0])
    expect(moves[0].options).toMatchObject({ zoom: 18 })
  })

  // Why `getInteracting()` is unusable here: this module's own fits emit resolution changes too.
  it('survives our own animation, and is spent by a scale the reader chose', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder(4)
    camera.locatePressed(view, null)
    camera.fitContent(view, [MUNICH])
    // The fit holds the count until OpenLayers releases it, a timeout later. Only after that is a
    // resolution change the reader's.
    camera.resolutionChanged()
    expect(camera.isFraming).toBe(true)
    moves[0].done?.(true)
    camera.resolutionChanged()
    camera.followFix(view, [0, 0])
    expect(moves[1].options).not.toHaveProperty('zoom')
  })

  it('is not spent by a resolution change inside a move we started', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder(4)
    camera.locatePressed(view, null)
    camera.applyFocus(view, { center: MUNICH, zoom: 16 }, null)
    camera.resolutionChanged()
    expect(camera.isFraming).toBe(true)
    moves[0].done?.(true)
    camera.followFix(view, [0, 0])
    expect(moves[1].options).toMatchObject({ zoom: 14 })
  })

  // A floor armed by a fixless press belongs to that press. Locating again with a fix in hand takes
  // the camera back without re-arming, which is what makes the clearing observable.
  it('is dropped when anything else takes the camera in between', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder(4)
    camera.locatePressed(view, null)
    camera.claim(BLOCK)
    camera.locatePressed(view, [0, 0])
    camera.followFix(view, [1, 1])
    expect(moves[1].options).not.toHaveProperty('zoom')
  })

  it('survives to the next fix when nothing took the camera in between', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder(4)
    camera.locatePressed(view, null)
    camera.locatePressed(view, [0, 0])
    camera.followFix(view, [1, 1])
    expect(moves[1].options).toMatchObject({ zoom: 14 })
  })
})

describe('the zoom buttons', () => {
  it('step from wherever the reader is, in both directions', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder(9)
    camera.zoomBy(view, 1)
    camera.zoomBy(view, -1)
    expect(moves[0].options).toMatchObject({ zoom: 10 })
    expect(moves[1].options).toMatchObject({ zoom: 8 })
  })

  it("spend the floor, because the scale is the reader's choice", () => {
    const camera = createCamera(14)
    const { moves, view } = recorder(4)
    camera.locatePressed(view, null)
    camera.zoomBy(view, 1)
    camera.followFix(view, [0, 0])
    expect(moves[1].options).not.toHaveProperty('zoom')
  })

  // A press that frames nothing is not a view worth handing back, or ending a follow releases to
  // the reader instead of to nobody.
  it('do not count as a framing', () => {
    const camera = createCamera(14)
    const { view } = recorder(9)
    camera.locatePressed(view, null)
    camera.zoomBy(view, 1)
    camera.followEnded()
    flushSync()
    expect(camera.owner).toEqual({ kind: 'none' })
  })
})

describe('the framing count', () => {
  // The content fit releases only through OpenLayers' callback. A second, synchronous release would
  // read as finished once this fit has a duration, and the animation would spend the zoom floor.
  it('is held by the content fit until OpenLayers releases it', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder()
    camera.fitContent(view, [MUNICH])
    expect(camera.isFraming).toBe(true)
    moves[0].done?.(true)
    expect(camera.isFraming).toBe(false)
  })

  it('returns to zero when a move completes', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder()
    camera.applyFocus(view, { center: MUNICH, zoom: 16 }, null)
    expect(camera.isFraming).toBe(true)
    moves[0].done?.(true)
    expect(camera.isFraming).toBe(false)
  })

  it('cannot be released twice by one move', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder()
    camera.applyFocus(view, { center: MUNICH, zoom: 16 }, null)
    moves[0].done?.(true)
    moves[0].done?.(true)
    expect(camera.isFraming).toBe(false)
    // A negative count would leave this unable to spend the floor for good.
    camera.applyFocus(view, { center: [1, 2], zoom: 16 }, null)
    expect(camera.isFraming).toBe(true)
  })

  it('does not leak on a focus that carries nothing to frame', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder()
    expect(camera.applyFocus(view, {}, null)).toBe(false)
    expect(moves).toHaveLength(0)
    expect(camera.isFraming).toBe(false)
  })
})

describe('projection', () => {
  it('reads a focus centre as latitude first', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder()
    camera.applyFocus(view, { center: MUNICH, zoom: 16 }, null)
    const center = (moves[0].options as { center: number[] }).center
    // Munich is north and east, so both are positive and x is the smaller one. A flipped pair puts
    // y at about 5.4m and x at about 6.1m.
    expect(center[0]).toBeGreaterThan(0)
    expect(center[1]).toBeGreaterThan(center[0])
  })

  it('reads a focus extent as [minLat, minLng, maxLat, maxLng]', () => {
    const camera = createCamera(14)
    const { moves, view } = recorder()
    camera.applyFocus(view, { extent: [48.1, 11.5, 48.3, 11.7] }, null)
    const [minX, minY, maxX, maxY] = moves[0].target as number[]
    expect(maxX).toBeGreaterThan(minX)
    expect(maxY).toBeGreaterThan(minY)
    // Longitude spans 0.2 degrees and latitude 0.2 degrees, but a degree of latitude is longer here.
    expect(maxY - minY).toBeGreaterThan(maxX - minX)
  })
})
