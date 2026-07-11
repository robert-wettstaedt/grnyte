import { zoom as d3Zoom, pointer, select, zoomIdentity, zoomTransform, type D3ZoomEvent } from 'd3'
import type { Action } from 'svelte/action'

interface PanzoomParams {
  /** When false the action is inert: no gestures, native transform, identity. */
  enabled: boolean
  /** Maximum zoom factor. */
  maxScale?: number
  /**
   * Aspect ratio (w/h) of letterboxed content inside the node (e.g. an
   * `object-contain` image). Pan/zoom is then clamped to the content's fitted
   * rect instead of the whole node — lightbox behaviour: at rest the content is
   * centred with empty bands beside it, zooming grows it into those bands, and
   * panning stops at the content's edges. Omit when content fills the node.
   */
  aspect?: number
  /** Called with the live zoom factor (1 = fit) whenever it changes. Lets a
   *  consumer gate its own gestures on whether the content is zoomed in. */
  onZoom?: (scale: number) => void
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
  let onZoom = params.onZoom

  // The pannable world: the content's contain-fit rect within the node (the
  // whole node when no aspect is given), plus the node size it was computed for
  // so a resize can map the old view onto the new geometry.
  let world = { x0: 0, y0: 0, w: 0, h: 0, width: 0, height: 0 }

  const behavior = d3Zoom<HTMLElement, unknown>()
    .scaleExtent([1, maxScale])
    .on('zoom', (event: D3ZoomEvent<HTMLElement, unknown>) => {
      const { x, y, k } = event.transform
      content.style.transform = `translate(${x}px, ${y}px) scale(${k})`
      onZoom?.(k)
    })

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
    behavior.scaleExtent([1, w > 0 && h > 0 ? Math.max(maxScale, width / w, height / h) : maxScale])
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
      aspect = next.aspect
      maxScale = next.maxScale ?? 4
      onZoom = next.onZoom
      if (next.enabled && !enabled) enable()
      else if (!next.enabled && enabled) disable()
      else if (enabled) {
        constrain()
        if (aspectChanged) selection.call(behavior.transform, zoomIdentity)
      }
    },
    destroy() {
      selection.on('.zoom', null)
      resizeObserver.disconnect()
    },
  }
}
