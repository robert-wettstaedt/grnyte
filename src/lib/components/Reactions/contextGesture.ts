import type { Attachment } from 'svelte/attachments'

/** How long a touch has to stay put before it counts as a press rather than the start of a scroll. */
const HOLD_MS = 450

/** How far it may drift in that time. Past this it was a scroll, and a scroll must not open anything. */
const DRIFT_PX = 10

/**
 * The platform's secondary gesture: press and hold on a finger, right click on a mouse. Both are
 * what a person already reaches for to ask "what else is there about this". Hover was tried first
 * and rejected: the popover opened on every cursor pass down a feed, over a control whose primary
 * action is a single click.
 *
 * The element keeps its own click on purpose: on a reaction chip a click toggles your reaction and
 * this gesture shows who else sent it, so a completed hold swallows the click it would have ended in.
 *
 * ponytail: lives next to its one consumer rather than in `$lib`. Promote it the day the map or the
 * topo editor wants the same gesture; both hand-roll their own today.
 */
export const createContextAttachment =
  (onInterest: (active: boolean) => void): Attachment<HTMLElement> =>
  (node) => {
    let timer: number | undefined
    let origin: undefined | { x: number; y: number }
    let swallowClick = false

    const cancel = () => {
      clearTimeout(timer)
      timer = undefined
      origin = undefined
    }

    const onPointerDown = (event: PointerEvent) => {
      // A mouse has `contextmenu` below, which is the same gesture without the wait.
      if (event.pointerType === 'mouse') {
        return
      }

      // Cleared here rather than only by the click it was set for: a hold that completes but
      // never produces one (the finger drifts before lifting, or the sheet opening cancels the
      // pointer) would otherwise leave the flag set, and the NEXT tap on this chip is the one
      // that gets eaten.
      swallowClick = false
      origin = { x: event.clientX, y: event.clientY }
      timer = window.setTimeout(() => {
        cancel()
        swallowClick = true
        onInterest(true)
      }, HOLD_MS)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (origin != null && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > DRIFT_PX) {
        cancel()
      }
    }

    // Capture, so the click dies before the button's own handler ever sees it. Exactly one is
    // swallowed: the one the finger lifting off a completed hold is about to produce.
    const onClick = (event: MouseEvent) => {
      if (swallowClick) {
        swallowClick = false
        event.preventDefault()
        event.stopPropagation()
      }
    }

    const onContextMenu = (event: Event) => {
      // Android raises its own menu on a long press, and iOS raises the selection callout. This is
      // also the mouse's way in: the browser menu holds nothing for a reaction chip, so the names
      // take its place.
      event.preventDefault()

      // Android's menu can beat our own timer, and then nothing has claimed the click the finger
      // is about to produce, which would toggle the reaction on the way out.
      if (timer != null) {
        swallowClick = true
      }

      cancel()
      onInterest(true)
    }

    node.addEventListener('click', onClick, true)
    node.addEventListener('contextmenu', onContextMenu)
    node.addEventListener('pointercancel', cancel)
    node.addEventListener('pointerdown', onPointerDown)
    node.addEventListener('pointermove', onPointerMove)
    node.addEventListener('pointerup', cancel)

    return () => {
      cancel()
      node.removeEventListener('click', onClick, true)
      node.removeEventListener('contextmenu', onContextMenu)
      node.removeEventListener('pointercancel', cancel)
      node.removeEventListener('pointerdown', onPointerDown)
      node.removeEventListener('pointermove', onPointerMove)
      node.removeEventListener('pointerup', cancel)
    }
  }
