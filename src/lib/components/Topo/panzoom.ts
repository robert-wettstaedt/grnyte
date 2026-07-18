import { zoom as d3Zoom, pointer, select, zoomIdentity, zoomTransform, type D3ZoomEvent, type ZoomTransform } from 'd3'
import type { Action } from 'svelte/action'

type Extent = [[number, number], [number, number]]

/**
 * Like d3's default constrain, but it lets the content overscroll the viewport by
 * half its size on each axis, so a corner of the image can be dragged to the
 * centre of the screen (not just pinned to an edge). The padding is a screen
 * half-viewport converted to world units via the live scale, so the reachable
 * slack stays a constant half-viewport at any zoom. By default this slack only
 * kicks in past fit (k > 1); with `overscroll` it applies at every zoom level,
 * turning the node into a free-pan canvas.
 */
export const overscrollConstrain = (
  transform: ZoomTransform,
  extent: Extent,
  translateExtent: Extent,
  overscroll = false,
): ZoomTransform => {
  const k = transform.k
  const slack = overscroll || k > 1
  const padX = slack ? (extent[1][0] - extent[0][0]) / 2 / k : 0
  const padY = slack ? (extent[1][1] - extent[0][1]) / 2 / k : 0
  const dx0 = transform.invertX(extent[0][0]) - (translateExtent[0][0] - padX)
  const dx1 = transform.invertX(extent[1][0]) - (translateExtent[1][0] + padX)
  const dy0 = transform.invertY(extent[0][1]) - (translateExtent[0][1] - padY)
  const dy1 = transform.invertY(extent[1][1]) - (translateExtent[1][1] + padY)
  return transform.translate(
    dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1),
    dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1),
  )
}

interface PanzoomParams {
  /** When false the action is inert: no gestures, native transform, identity. */
  enabled: boolean
  /** Maximum zoom factor. */
  maxScale?: number
  /** Minimum zoom factor (1 = fit). Below 1 shrinks the content within the node. Default 1. */
  minScale?: number
  /** Allow the half-viewport overscroll at every zoom level, not just past fit — a
   *  free-pan canvas where the content can be nudged even at or below fit. Default false. */
  overscroll?: boolean
  /**
   * Aspect ratio (w/h) of letterboxed content inside the node (e.g. an
   * `object-contain` image). Pan/zoom is then clamped to the content's fitted
   * rect instead of the whole node — lightbox behaviour: at rest the content is
   * centred with empty bands beside it, zooming grows it into those bands, and
   * panning stops at the content's edges. Omit when content fills the node.
   */
  aspect?: number
  /** Called with the live zoom factor (1 = fit) and whether the view is at rest
   *  (fit and centred) whenever the transform changes. Lets a consumer gate its
   *  own gestures on zoom, and show a reset chip whenever the view is off-default. */
  onZoom?: (scale: number, atRest: boolean) => void
  /** Bump this number to animate back to fit (the "reset zoom" chip). */
  resetSignal?: number
  /**
   * Suppress pan/zoom gestures entirely (but keep the current transform). Set while the
   * consumer is drawing/placing so a press doesn't pan the photo out from under it.
   */
  blockPan?: boolean
}

/**
 * Pinch / wheel / double-click zoom + drag pan, powered by d3-zoom — which
 * handles mouse, touch and trackpad and clamps panning to the bounds for us.
 *
 * Attach to a static `overflow-hidden` container; its first child element is the
 * one transformed. d3 only swallows the click that ends a real drag, so a tap on
 * an interactive overlay inside the child (the route lines) still fires.
 */
export const panzoom: Action<HTMLElement, PanzoomParams> = (node, params) => {
  const content = node.firstElementChild as HTMLElement
  content.style.transformOrigin = '0 0'

  let enabled = false
  let aspect = params.aspect
  let maxScale = params.maxScale ?? 4
  let minScale = params.minScale ?? 1
  let overscroll = params.overscroll ?? false
  let onZoom = params.onZoom
  let resetSignal = params.resetSignal
  let blockPan = params.blockPan ?? false

  // The pannable world: the content's contain-fit rect within the node (the
  // whole node when no aspect is given), plus the node size it was computed for
  // so a resize can map the old view onto the new geometry.
  let world = { x0: 0, y0: 0, w: 0, h: 0, width: 0, height: 0 }

  const behavior = d3Zoom<HTMLElement, unknown>()
    .scaleExtent([minScale, maxScale])
    // Reject gestures that begin on an interactive overlay (route handles/lines, marked
    // `data-no-pan`) or while the consumer is drawing (`blockPan`). Their own Svelte handlers
    // can't stop us: Svelte delegates pointerdown/mousedown/touchstart to the document root,
    // which runs AFTER this node's native listener — so `stopPropagation` there is too late.
    // The filter runs inside d3's own handler with the real target, so it isn't. The tail is
    // d3's default filter (allow the wheel; ignore ctrl-clicks and non-primary buttons).
    .filter((event) => {
      if (blockPan) return false
      const target = event.target
      if (target instanceof Element && target.closest('[data-no-pan]') != null) return false
      return (!event.ctrlKey || event.type === 'wheel') && !event.button
    })
    .on('zoom', (event: D3ZoomEvent<HTMLElement, unknown>) => {
      const { x, y, k } = event.transform
      content.style.transform = `translate(${x}px, ${y}px) scale(${k})`
      onZoom?.(k, Math.abs(k - 1) < 1e-3 && Math.abs(x) < 0.5 && Math.abs(y) < 0.5)
    })
    .constrain((t, e, te) => overscrollConstrain(t, e as Extent, te as Extent, overscroll))

  const selection = select<HTMLElement, unknown>(node)

  // Pan stays inside the image: the pannable world is the image's contain-fit
  // rect (the whole node when no aspect is given). d3's default constraint
  // centres the world while it's smaller than the viewport in an axis, so the
  // letterbox bands stay symmetric until the zoomed image grows past them. The
  // max zoom is raised (if needed) to where the image covers the whole node.
  const constrain = () => {
    const width = node.clientWidth
    const height = node.clientHeight

    let x0 = 0
    let y0 = 0
    let w = width
    let h = height

    if (aspect != null && width > 0 && height > 0) {
      w = Math.min(width, height * aspect)
      h = w / aspect
      x0 = (width - w) / 2
      y0 = (height - h) / 2
    }

    world = { x0, y0, w, h, width, height }
    behavior.translateExtent([
      [x0, y0],
      [x0 + w, y0 + h],
    ])
    behavior.scaleExtent([minScale, w > 0 && h > 0 ? Math.max(maxScale, width / w, height / h) : maxScale])
  }

  // A resize (the mobile sheet dragging the box) re-lays-out the letterboxed
  // content, so the current pixel transform would drift off the image and past
  // the new extents. Rebuild it instead: same image point under the viewport
  // centre, same fit-relative zoom, clamped to the new extents (programmatic
  // transforms bypass d3's gesture clamping, so clamp explicitly).
  const rescale = (prev: typeof world) => {
    const t = zoomTransform(node)
    if (t.k === 1 || prev.w === 0 || prev.h === 0 || world.w === 0 || world.h === 0) return

    const k = Math.min(t.k, behavior.scaleExtent()[1])
    const ux = ((prev.width / 2 - t.x) / t.k - prev.x0) / prev.w
    const uy = ((prev.height / 2 - t.y) / t.k - prev.y0) / prev.h
    const next = zoomIdentity
      .translate(world.width / 2 - k * (world.x0 + ux * world.w), world.height / 2 - k * (world.y0 + uy * world.h))
      .scale(k)
    const clamped = behavior.constrain()(
      next,
      [
        [0, 0],
        [world.width, world.height],
      ],
      behavior.translateExtent(),
    )
    selection.call(behavior.transform, clamped)
  }

  const enable = () => {
    enabled = true
    constrain()
    node.style.touchAction = 'none'
    selection.call(behavior)
    // d3's default double-click doubles the zoom until maxScale and then goes
    // inert; replace it so a double-click at max flies back to fit instead.
    // d3's touch double-tap dispatches through this same listener.
    selection.on('dblclick.zoom', (event: MouseEvent | TouchEvent) => {
      event.preventDefault()
      const transition = selection.transition().duration(250)
      if (zoomTransform(node).k >= behavior.scaleExtent()[1] - 1e-6) {
        transition.call(behavior.transform, zoomIdentity)
      } else {
        const p = pointer('changedTouches' in event ? event.changedTouches[0] : event, node)
        transition.call(behavior.scaleBy, 2, p)
      }
    })
  }

  const disable = () => {
    enabled = false
    selection.call(behavior.transform, zoomIdentity)
    selection.on('.zoom', null)
    node.style.touchAction = ''
    content.style.transform = ''
  }

  const resizeObserver = new ResizeObserver(() => {
    if (!enabled) return
    const prev = world
    constrain()
    rescale(prev)
  })
  resizeObserver.observe(node)

  if (params.enabled) enable()

  return {
    update(next: PanzoomParams) {
      // A different image is a different coordinate space — start over at fit.
      const aspectChanged = next.aspect !== aspect
      const resetRequested = next.resetSignal !== resetSignal
      aspect = next.aspect
      maxScale = next.maxScale ?? 4
      minScale = next.minScale ?? 1
      overscroll = next.overscroll ?? false
      onZoom = next.onZoom
      resetSignal = next.resetSignal
      blockPan = next.blockPan ?? false
      if (next.enabled && !enabled) enable()
      else if (!next.enabled && enabled) disable()
      else if (enabled) {
        constrain()
        if (aspectChanged) selection.call(behavior.transform, zoomIdentity)
        else if (resetRequested) selection.transition().duration(200).call(behavior.transform, zoomIdentity)
      }
    },
    destroy() {
      selection.on('.zoom', null)
      resizeObserver.disconnect()
    },
  }
}
