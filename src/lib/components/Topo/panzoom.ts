import { zoom as d3Zoom, select, zoomIdentity, type D3ZoomEvent } from 'd3'
import type { Action } from 'svelte/action'

interface PanzoomParams {
  /** When false the action is inert: no gestures, native transform, identity. */
  enabled: boolean
  /** Maximum zoom factor. */
  maxScale?: number
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

  const behavior = d3Zoom<HTMLElement, unknown>()
    .scaleExtent([1, params.maxScale ?? 4])
    .on('zoom', (event: D3ZoomEvent<HTMLElement, unknown>) => {
      const { x, y, k } = event.transform
      content.style.transform = `translate(${x}px, ${y}px) scale(${k})`
    })

  const selection = select<HTMLElement, unknown>(node)

  // Pan stays inside the image: the pannable world is exactly one viewport, so
  // d3 won't let the edges drift inwards.
  const constrain = () => {
    behavior.translateExtent([
      [0, 0],
      [node.clientWidth, node.clientHeight],
    ])
  }

  const enable = () => {
    enabled = true
    constrain()
    node.style.touchAction = 'none'
    selection.call(behavior)
  }

  const disable = () => {
    enabled = false
    selection.call(behavior.transform, zoomIdentity)
    selection.on('.zoom', null)
    node.style.touchAction = ''
    content.style.transform = ''
  }

  const resizeObserver = new ResizeObserver(() => {
    if (enabled) constrain()
  })
  resizeObserver.observe(node)

  if (params.enabled) enable()

  return {
    update(next: PanzoomParams) {
      behavior.scaleExtent([1, next.maxScale ?? 4])
      if (next.enabled && !enabled) enable()
      else if (!next.enabled && enabled) disable()
    },
    destroy() {
      selection.on('.zoom', null)
      resizeObserver.disconnect()
    },
  }
}
