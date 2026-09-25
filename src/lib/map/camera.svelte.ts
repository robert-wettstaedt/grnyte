import { fromLonLat } from 'ol/proj.js'
import { untrack } from 'svelte'
import type { MapCameraClaim, MapFocus } from './types'

// One owner at a time, and only the owner moves the camera. The route claims it, because the route
// is known before the row it will frame has arrived.

export type CameraClaim = Exclude<CameraOwner, { kind: 'none' }>

/** The key makes a repeat request for the same entity a new claim. */
export type CameraOwner =
  { key: string; kind: 'entity' } | { kind: 'content' } | { kind: 'location' } | { kind: 'none' } | { kind: 'reader' }

export const claimKey = (claim: null | undefined | { key: string; kind: string }): string | undefined =>
  claim == null ? undefined : `${claim.kind}:${claim.key}`

export function canMove(owner: CameraOwner, claim: CameraClaim): boolean {
  if (claim.kind === 'entity') return owner.kind === 'entity' && owner.key === claim.key
  if (claim.kind === 'content') return owner.kind === 'none'
  return owner.kind === claim.kind
}

export function nextOwner(current: CameraOwner, claim: CameraClaim): CameraOwner {
  if (claim.kind === 'content' && current.kind !== 'none') return current
  return claim
}

/** A claim carries a key. Ownership does not, because there is only one reader. */
const toOwnerClaim = (claim: MapCameraClaim): CameraClaim =>
  claim.kind === 'entity' ? { key: claim.key, kind: 'entity' } : { kind: 'reader' }

/** The part of an OpenLayers `View` this module moves. Narrow, so the camera can be tested without
 *  a map, a DOM or a layout. */
export interface CameraView {
  // `done` is required and takes the completion flag, so a real `View` matches this type.
  animate(options: { center?: number[]; duration?: number; zoom?: number }, done: (complete: boolean) => void): void
  fit(
    extent: number[],
    options?: { callback?: (complete: boolean) => void; duration?: number; maxZoom?: number; padding?: number[] },
  ): void
  getZoom(): number | undefined
}

/** Latitude first. This module projects, so no caller flips a pair. */
export type LatLng = [number, number]
/** Already in the view's projection, as OpenLayers hands it over. */
export type ViewPoint = number[]

const project = ([lat, long]: LatLng): ViewPoint => fromLonLat([long, lat])

/** Above this the fit stops zooming in, so a lone block does not land at street level. */
const CONTENT_MAX_ZOOM = 15
/** A point further than this from the median is an outlier, not part of the region. */
const OUTLIER_METRES = 200_000

/** The extent to frame, without outliers. The median is always kept, so the result is never empty. */
export function contentExtent(coords: LatLng[]): [number, number, number, number] | null {
  if (coords.length === 0) return null
  const points = coords.map(project)
  const sorted = points.toSorted((a, b) => Math.sqrt(a[0] ** 2 + a[1] ** 2) - Math.sqrt(b[0] ** 2 + b[1] ** 2))
  const median = sorted[Math.floor(sorted.length / 2)]
  const kept = points.filter((p) => Math.sqrt((p[0] - median[0]) ** 2 + (p[1] - median[1]) ** 2) < OUTLIER_METRES)
  const xs = kept.map((p) => p[0])
  const ys = kept.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/**
 * Owns who may move the explore camera, and every move. The component sends events and reads the
 * getters. It never touches the view.
 *
 * @param fallbackZoom the zoom for a focus that carries none, and the floor for a locate press.
 */
export function createCamera(fallbackZoom: number) {
  let owner = $state<CameraOwner>({ kind: 'none' })

  // Whether anything has framed this camera yet. Separates "nothing has happened" from "the reader
  // has a view worth keeping".
  let hasFramed = $state(false)
  // Set when locate is pressed before any fix exists, so the zoom floor lands on the fix that follows.
  let pendingZoomFloor = false
  // Non-zero while this module moves the camera, so its own animation cannot spend the zoom floor.
  // A count, because the fits are animated and overlap.
  let framing = $state(0)
  // The last focus and claim applied, so equal-valued recomputations are skipped.
  let lastFocusKey: string | undefined
  let lastClaimKey: string | undefined

  // Internal reads never subscribe. A method that reads and writes its own state would otherwise
  // re-trigger the effect that called it. The getters stay reactive, so all four behave alike.
  const current = () => untrack(() => owner)
  const framed = () => untrack(() => hasFramed)
  const moving = () => untrack(() => framing)

  const beginMove = () => {
    hasFramed = true
    framing = moving() + 1
    let released = false
    // Guard against a double release. A negative count would ungate the floor for good.
    return () => {
      if (released) return
      released = true
      framing = moving() - 1
    }
  }

  return {
    /** Frame what the route asked for, if its claim still holds the camera. Returns whether it moved. */
    applyFocus(view: CameraView, focus: MapFocus, claim: MapCameraClaim | null | undefined): boolean {
      // Move only when the target changed, because the parent rebuilds `focus` on every data change.
      // Padding is excluded, because it tracks sheet coverage.
      const key = JSON.stringify({ c: focus.center, e: focus.extent, z: focus.zoom })
      if (key === lastFocusKey) return false
      // Without a claim, `focus` alone drives the view (pickers, static previews).
      if (claim != null && !canMove(current(), toOwnerClaim(claim))) return false
      lastFocusKey = key
      const done = beginMove()

      if (focus.extent != null) {
        // `[minLat, minLng, maxLat, maxLng]` in, `[minX, minY, maxX, maxY]` out.
        const [minX, minY] = project([focus.extent[0], focus.extent[1]])
        const [maxX, maxY] = project([focus.extent[2], focus.extent[3]])
        view.fit([minX, minY, maxX, maxY], {
          callback: done,
          duration: 300,
          maxZoom: focus.zoom ?? fallbackZoom,
          padding: focus.padding ?? [50, 50, 50, 50],
        })
        return true
      }
      if (focus.center != null) {
        const zoom = focus.zoom ?? fallbackZoom
        const [x, y] = project(focus.center)
        if (focus.padding != null) {
          view.fit([x, y, x, y], {
            callback: done,
            duration: 300,
            maxZoom: zoom,
            padding: focus.padding,
          })
        } else {
          view.animate({ center: [x, y], duration: 300, zoom }, done)
        }
        return true
      }
      // Nothing to frame, so release the count instead of leaking it.
      done()
      return false
    },
    /** Take ownership for the route's entity, or for the reader's own remembered view. */
    claim(next: MapCameraClaim | null | undefined): void {
      if (next == null) {
        // Null means the route carries no entity. Ownership is not released.
        lastClaimKey = undefined
        return
      }
      const key = claimKey(next)
      if (key === lastClaimKey) return
      lastClaimKey = key
      // A floor armed by a fixless press belongs to that press. Anything else taking the camera
      // drops it, or an unrelated fix pulls a deliberate zoom-out back in.
      pendingZoomFloor = false
      // A fresh claim re-frames an unchanged focus, which is how "show on map" works.
      lastFocusKey = undefined
      owner = nextOwner(current(), toOwnerClaim(next))
    },
    /** The default framing, while nothing owns the camera. Returns whether it moved. */
    fitContent(view: CameraView, points: LatLng[]): boolean {
      const at = current()
      // Before anything has framed, no owner blocks the first paint. A pan over an empty view is
      // not worth keeping, and a claim can still fail to frame.
      if (framed() && !canMove(at, { kind: 'content' })) return false
      const extent = contentExtent(points)
      if (extent == null) return false
      // Claims only an unowned camera. Under a pending locate this is a provisional paint, and
      // claiming would stop the fix that press asked for.
      if (at.kind === 'none') owner = nextOwner(at, { kind: 'content' })
      // Release through the callback only. OpenLayers defers it by a timeout, so a second release
      // here would free the count too early once this fit has a duration.
      view.fit(extent, { callback: beginMove(), maxZoom: CONTENT_MAX_ZOOM })
      return true
    },
    /** Tracking stopped or errored. */
    followEnded(): void {
      if (current().kind !== 'location') return
      pendingZoomFloor = false
      // Handed to the reader once there is a view worth keeping. Before that, release to nobody, or
      // the map stays on its default view for the session.
      owner = framed() ? { kind: 'reader' } : { kind: 'none' }
    },

    /** A fix from the device. Follows only while location owns the camera. Returns whether it moved. */
    followFix(view: CameraView, position: ViewPoint): boolean {
      if (!canMove(current(), { kind: 'location' })) return false
      const floor = pendingZoomFloor ? fallbackZoom : undefined
      pendingZoomFloor = false
      const done = beginMove()
      view.animate(
        floor == null
          ? { center: position, duration: 200 }
          : { center: position, duration: 200, zoom: Math.max(view.getZoom() ?? 0, floor) },
        done,
      )
      return true
    },

    get hasFramed() {
      return hasFramed
    },

    get isFollowingLocation() {
      return owner.kind === 'location'
    },

    /** True while a fit or animation we started is still running. */
    get isFraming() {
      return framing > 0
    },

    /** The locate control. `position` is the fix already in hand, or null if none has arrived. */
    locatePressed(view: CameraView, position: null | ViewPoint): void {
      owner = nextOwner(current(), { kind: 'location' })
      if (position == null) {
        // No fix yet, so the floor rides on the first one rather than being lost.
        pendingZoomFloor = true
        return
      }
      // A floor, never a reduction. A reader already looking closely keeps their scale.
      const done = beginMove()
      view.animate({ center: position, duration: 200, zoom: Math.max(view.getZoom() ?? 0, fallbackZoom) }, done)
    },

    get owner() {
      return owner
    },

    /** A deliberate pan, pinch, wheel, double-click or arrow key: the reader takes the camera. */
    readerMoved(): void {
      pendingZoomFloor = false
      const at = current()
      if (at.kind === 'reader') return
      owner = nextOwner(at, { kind: 'reader' })
    },

    /** Any resolution change. Only a scale the reader chose spends the floor, so the test is whether
     *  this module is moving. OpenLayers sets no hint for wheel, keyboard or double-click zoom. */
    resolutionChanged(): void {
      if (moving() === 0) pendingZoomFloor = false
    },

    /** The +/- buttons. Spends the floor but keeps a location follow. Not counted as a framing,
     *  because the press frames nothing. */
    zoomBy(view: CameraView, delta: number): void {
      pendingZoomFloor = false
      const zoom = view.getZoom()
      if (zoom == null) return
      view.animate({ duration: 200, zoom: zoom + delta }, () => {})
    },
  }
}
