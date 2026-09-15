import type { Attachment } from 'svelte/attachments'

/** Hold time before repeating starts, the platform convention, and long enough that a tap never doubles. */
const DELAY_MS = 500

/** Ten steps a second. Constant on purpose: these ranges are a couple of dozen values, too short to accelerate. */
const INTERVAL_MS = 100

/**
 * Press and hold to keep stepping. A tap steps on release, so a swipe starting on the button scrolls
 * without moving the value. Owns the keyboard click too, so attach this instead of an `onclick`.
 */
export const createPressRepeat =
  (step: () => void): Attachment<HTMLElement> =>
  (node) => {
    let delayTimer: ReturnType<typeof setTimeout> | undefined
    let repeatTimer: ReturnType<typeof setInterval> | undefined
    let pressing = false
    let repeated = false
    /** The pointer currently holding the button, so other pointers cannot cancel its repeat. */
    let held: null | number = null

    const stop = () => {
      clearTimeout(delayTimer)
      clearInterval(repeatTimer)
      delayTimer = undefined
      repeatTimer = undefined
      pressing = false
      held = null
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return
      }
      pressing = true
      repeated = false
      held = event.pointerId
      try {
        node.setPointerCapture(event.pointerId)
      } catch {
        // No capture, so a finger sliding off ends the press on `pointerout` instead.
        node.addEventListener('pointerout', onPointerCancel)
      }

      delayTimer = setTimeout(() => {
        repeated = true
        step()
        repeatTimer = setInterval(() => {
          // A disabled button stops sending pointer events, so the interval would outlive it.
          if (node.matches(':disabled')) {
            stop()
            return
          }
          step()
        }, INTERVAL_MS)
      }, DELAY_MS)
    }

    // Both ignore any pointer but the one holding the button: a second finger or a resting cursor
    // would otherwise cancel the hold after a single tick.
    const onPointerUp = (event: PointerEvent) => {
      if (held != null && event.pointerId !== held) {
        return
      }
      const tapped = pressing && !repeated
      stop()
      if (tapped) {
        step()
      }
    }

    /** A scroll took the gesture over, or the finger left. Never a step. */
    const onPointerCancel = (event: PointerEvent) => {
      if (held != null && event.pointerId !== held) {
        return
      }
      stop()
    }

    const onClick = (event: MouseEvent) => {
      if (event.detail === 0) {
        step()
      }
    }

    node.addEventListener('pointerdown', onPointerDown)
    node.addEventListener('pointerup', onPointerUp)
    node.addEventListener('pointercancel', onPointerCancel)
    node.addEventListener('lostpointercapture', onPointerCancel)
    node.addEventListener('click', onClick)

    return () => {
      stop()
      node.removeEventListener('pointerdown', onPointerDown)
      node.removeEventListener('pointerup', onPointerUp)
      node.removeEventListener('pointercancel', onPointerCancel)
      node.removeEventListener('lostpointercapture', onPointerCancel)
      node.removeEventListener('pointerout', onPointerCancel)
      node.removeEventListener('click', onClick)
    }
  }
